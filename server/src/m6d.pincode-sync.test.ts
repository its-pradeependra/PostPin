import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hashPassword } from "@/lib/crypto.js";
import { env } from "@/config/env.js";
import {
  AuditLogModel,
  PermissionModel,
  PincodeModel,
  PincodeSyncLogModel,
  PlanModel,
  RoleModel,
  UserModel,
} from "@/models/index.js";
import { getSyncStatus } from "@/services/pincode-sync.service.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { PLATFORM_ROLES } from "@/shared/roles.js";
import {
  applyDirectory,
  dedupeDirectory,
  msUntilNextIST,
  runLiveSync,
  type DirectoryRecord,
} from "@/services/pincode-sync.service.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
const ADMIN = "root@postpin.test";
let app: AppInstance;

async function seed() {
  await PermissionModel.insertMany(
    PERMISSIONS.map((p) => ({ key: p.key, resource: p.resource, action: p.action, group: p.group, scope: p.scope, description: p.description, isDangerous: "isDangerous" in p ? p.isDangerous : false })),
  );
  const perms = await PermissionModel.find().select("key").lean();
  const permIdByKey = new Map(perms.map((p) => [p.key, p._id]));
  for (const r of PLATFORM_ROLES) {
    await RoleModel.create({ companyId: null, key: r.key, name: r.name, scope: "platform", isSystem: true, permissionIds: r.permissions.map((k) => permIdByKey.get(k)).filter(Boolean) });
  }
  const superRole = await RoleModel.findOne({ companyId: null, key: "super_admin" });
  await UserModel.create({ companyId: null, email: ADMIN, name: "Root Admin", passwordHash: await hashPassword(PW), roleId: superRole!._id, isPlatformStaff: true, status: "active", emailVerifiedAt: new Date() });
  await PlanModel.create({ code: "free", name: "Free", description: "Free", priceMonthlyPaise: 0, priceYearlyPaise: 0, includedCalls: 1000, maxApiKeys: 10, maxTeamMembers: 2, version: 1, rateLimit: { rpm: 30, rpd: 0, burst: 10 }, isActive: true, isPublic: true, sortOrder: 0 });
}

async function login(email: string, password = PW) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  return (res.json() as { access_token?: string }).access_token;
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

/** A tiny Response-like stub returning a fixed data.gov.in page. */
function stubFetchOnce(records: DirectoryRecord[], total = records.length) {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ records, total }),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeAll(async () => {
  await startMemoryDb();
  await initJwt();
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await stopMemoryDb();
});
beforeEach(async () => {
  await clearCollections();
  await seed();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────
// Pure units — no DB, no network
// ────────────────────────────────────────────────────────────────────────────
describe("M6d — sync schedule math (msUntilNextIST)", () => {
  it("computes the next 00:30 IST from the Unix epoch (05:30 IST) as 19h away", () => {
    // epoch = 1970-01-01T00:00:00Z = 05:30 IST → next 00:30 IST is 19h later.
    expect(msUntilNextIST("00:30", 0)).toBe(19 * 3600_000);
  });

  it("returns the same-day gap when the target is still ahead", () => {
    // 05:30 IST → 06:00 IST = 30 minutes.
    expect(msUntilNextIST("06:00", 0)).toBe(30 * 60_000);
  });

  it("always resolves to a strictly-positive delay within the next 24h", () => {
    for (const t of ["00:00", "00:30", "12:15", "23:59"]) {
      const d = msUntilNextIST(t, 0);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(86_400_000);
    }
  });

  it("rolls to tomorrow when the target equals the current minute", () => {
    // Choose now so IST time is exactly 00:30 → target must jump a full day.
    const IST_OFFSET = 5.5 * 3600_000;
    const now = 30 * 60_000 - IST_OFFSET; // IST = 00:30 exactly
    expect(msUntilNextIST("00:30", now)).toBe(86_400_000);
  });
});

describe("M6d — dedupeDirectory (office collapse + classification)", () => {
  it("keeps the head office over sub/branch offices regardless of arrival order", () => {
    const recs: DirectoryRecord[] = [
      { pincode: "400001", officename: "Fort BO", officetype: "BO", district: "Mumbai", statename: "Maharashtra" },
      { pincode: "400001", officename: "Mumbai GPO HO", officetype: "HO", district: "Mumbai", statename: "Maharashtra" },
      { pincode: "400001", officename: "Fort SO", officetype: "SO", district: "Mumbai", statename: "Maharashtra" },
    ];
    const map = dedupeDirectory(recs);
    expect(map.size).toBe(1);
    const row = map.get("400001")!;
    expect(row.rank).toBe(3); // HO
    expect(row.officeName).toBe("Mumbai GPO"); // "HO" suffix stripped
    expect(row.isMetro).toBe(true); // Mumbai
    expect(row.isRemote).toBe(false);
  });

  it("flags remote NE/J&K/island states and skips malformed pincodes", () => {
    const recs: DirectoryRecord[] = [
      { pincode: "781001", officename: "Guwahati HO", officetype: "HO", district: "Kamrup", statename: "Assam", latitude: "26.18", longitude: "91.75" },
      { pincode: "12", officename: "Bad", officetype: "BO", district: "X", statename: "Y" }, // invalid
      { pincode: "744101", officename: "Port Blair HO", officetype: "HO", district: "South Andaman", statename: "Andaman and Nicobar Islands" },
    ];
    const map = dedupeDirectory(recs);
    expect(map.size).toBe(2);
    expect(map.get("781001")).toMatchObject({ isRemote: true, isMetro: false, lat: 26.18, lng: 91.75 });
    expect(map.get("744101")!.isRemote).toBe(true);
    expect(map.has("12")).toBe(false);
  });

  it("nulls out zero/NaN coordinates", () => {
    const map = dedupeDirectory([
      { pincode: "302001", officename: "Jaipur GPO", officetype: "HO", district: "Jaipur", statename: "Rajasthan", latitude: "0", longitude: "NA" },
    ]);
    expect(map.get("302001")).toMatchObject({ lat: null, lng: null });
  });

  it("accumulates across pages into a shared map", () => {
    const map = dedupeDirectory([{ pincode: "110001", officename: "CP HO", officetype: "HO", district: "New Delhi", statename: "Delhi" }]);
    dedupeDirectory([{ pincode: "560001", officename: "Bangalore GPO", officetype: "HO", district: "Bangalore", statename: "Karnataka" }], map);
    expect(map.size).toBe(2);
    expect(map.get("110001")!.isMetro).toBe(true);
    expect(map.get("560001")!.isMetro).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DB-backed
// ────────────────────────────────────────────────────────────────────────────
describe("M6d — applyDirectory (bulk upsert)", () => {
  it("inserts new pincodes then updates on re-apply (added vs updated counts)", async () => {
    const syncId = new Types.ObjectId();
    const first = dedupeDirectory([
      { pincode: "110001", officename: "CP HO", officetype: "HO", district: "New Delhi", statename: "Delhi" },
      { pincode: "781001", officename: "Guwahati HO", officetype: "HO", district: "Kamrup", statename: "Assam" },
    ]);
    const c1 = await applyDirectory(first, syncId);
    expect(c1).toMatchObject({ scanned: 2, added: 2, updated: 0 });

    const doc = await PincodeModel.findOne({ pincode: "110001" }).lean();
    expect(doc).toMatchObject({ source: "india_post", status: "active", isMetro: true });
    expect(String((doc as { lastSyncId: Types.ObjectId }).lastSyncId)).toBe(String(syncId));

    // Re-apply with a changed office name → update, not insert.
    const second = dedupeDirectory([
      { pincode: "110001", officename: "Connaught Place HO", officetype: "HO", district: "New Delhi", statename: "Delhi" },
    ]);
    const c2 = await applyDirectory(second, new Types.ObjectId());
    expect(c2).toMatchObject({ added: 0, updated: 1 });
    expect((await PincodeModel.findOne({ pincode: "110001" }).lean())!.officeName).toBe("Connaught Place");
  });
});

describe("M6d — runLiveSync (mocked data.gov.in fetch)", () => {
  let savedKey: string;
  beforeEach(() => {
    savedKey = env.DATA_GOV_IN_API_KEY;
    (env as { DATA_GOV_IN_API_KEY: string }).DATA_GOV_IN_API_KEY = "test-key-live";
  });
  afterEach(() => {
    (env as { DATA_GOV_IN_API_KEY: string }).DATA_GOV_IN_API_KEY = savedKey;
  });

  it("fetches, dedupes, upserts, logs success and writes an audit", async () => {
    const fetchFn = stubFetchOnce([
      { pincode: "400001", officename: "Mumbai GPO HO", officetype: "HO", district: "Mumbai", statename: "Maharashtra", latitude: "18.93", longitude: "72.83" },
      { pincode: "400001", officename: "Fort BO", officetype: "BO", district: "Mumbai", statename: "Maharashtra" }, // dup office
      { pincode: "700001", officename: "Kolkata GPO HO", officetype: "HO", district: "Kolkata", statename: "West Bengal" },
    ]);

    const out = await runLiveSync("manual", null);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(out.skipped).toBe(false);
    if (out.skipped === false) {
      expect(out.counts).toMatchObject({ added: 2, updated: 0 }); // 3 offices → 2 pincodes
      expect(out.counts.scanned).toBe(3); // offices scanned
    }

    expect(await PincodeModel.countDocuments()).toBe(2);
    const mumbai = await PincodeModel.findOne({ pincode: "400001" }).lean();
    expect(mumbai).toMatchObject({ officeName: "Mumbai GPO", isMetro: true, source: "india_post" });

    const log = await PincodeSyncLogModel.findOne({ trigger: "manual" }).lean();
    expect(log).toMatchObject({ status: "success", source: "india_post" });
    expect((log as { counts: { added: number } }).counts.added).toBe(2);

    const audit = await AuditLogModel.findOne({ action: "pincode.sync" }).lean();
    expect(audit).toMatchObject({ category: "pincode", outcome: "success" });
  });

  it("records a failed sync log + critical audit when the source errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    await expect(runLiveSync("cron")).rejects.toThrow(/503/);

    const log = await PincodeSyncLogModel.findOne({ trigger: "cron" }).lean();
    expect(log).toMatchObject({ status: "failed" });
    expect((log as { error: string }).error).toMatch(/503/);

    const audit = await AuditLogModel.findOne({ action: "pincode.sync.failed" }).lean();
    expect(audit).toMatchObject({ severity: "critical", outcome: "failure" });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Authz on the manual-trigger route
// ────────────────────────────────────────────────────────────────────────────
describe("M6d — POST /v1/admin/pincodes/sync authorization", () => {
  it("rejects a tenant user without pincode:sync (403)", async () => {
    await onboardCompany({ companyName: "Tenant Co", ownerName: "Owner", ownerEmail: "owner@tenant.test", password: PW, emailVerified: true });
    const t = (await login("owner@tenant.test"))!;
    const res = await app.inject({ method: "POST", url: "/v1/admin/pincodes/sync", headers: auth(t) });
    expect(res.statusCode).toBe(403);
  });

  it("reports durable running status and single-flights a second trigger (409)", async () => {
    const saved = env.DATA_GOV_IN_API_KEY;
    (env as { DATA_GOV_IN_API_KEY: string }).DATA_GOV_IN_API_KEY = "test-key-live";
    try {
      const t = (await login(ADMIN))!;
      // Simulate a run already in progress via a durable "running" log.
      await PincodeSyncLogModel.create({ trigger: "manual", source: "india_post", status: "running" });

      const status = await app.inject({ method: "GET", url: "/v1/admin/pincodes/sync/status", headers: auth(t) });
      expect((status.json() as { running: boolean }).running).toBe(true);

      const blocked = await app.inject({ method: "POST", url: "/v1/admin/pincodes/sync", headers: auth(t) });
      expect(blocked.statusCode).toBe(409);
      expect((blocked.json() as { error: { code: string } }).error.code).toBe("sync_in_progress");
    } finally {
      (env as { DATA_GOV_IN_API_KEY: string }).DATA_GOV_IN_API_KEY = saved;
    }
  });

  it("treats a stale (>15m) running log as a dead lock, not a block", async () => {
    const stale = new Date(Date.now() - 20 * 60_000);
    await PincodeSyncLogModel.create({ trigger: "cron", source: "india_post", status: "running", startedAt: stale });
    const s = await getSyncStatus();
    expect(s.running).toBe(false);
  });

  it("returns 409 sync_not_configured when no API key is set", async () => {
    const saved = env.DATA_GOV_IN_API_KEY;
    (env as { DATA_GOV_IN_API_KEY: string }).DATA_GOV_IN_API_KEY = "";
    try {
      const t = (await login(ADMIN))!;
      const res = await app.inject({ method: "POST", url: "/v1/admin/pincodes/sync", headers: auth(t) });
      expect(res.statusCode).toBe(409);
      expect((res.json() as { error: { code: string } }).error.code).toBe("sync_not_configured");
    } finally {
      (env as { DATA_GOV_IN_API_KEY: string }).DATA_GOV_IN_API_KEY = saved;
    }
  });

  it("accepts (202) and drains a manual run when configured", async () => {
    const saved = env.DATA_GOV_IN_API_KEY;
    (env as { DATA_GOV_IN_API_KEY: string }).DATA_GOV_IN_API_KEY = "test-key-live";
    stubFetchOnce([{ pincode: "560001", officename: "Bangalore GPO HO", officetype: "HO", district: "Bangalore", statename: "Karnataka" }]);
    try {
      const t = (await login(ADMIN))!;
      const res = await app.inject({ method: "POST", url: "/v1/admin/pincodes/sync", headers: auth(t) });
      expect(res.statusCode).toBe(202);
      expect((res.json() as { started: boolean }).started).toBe(true);

      // The route is fire-and-forget — wait for the background run to record its log
      // so it doesn't race the DB teardown.
      let log: unknown = null;
      for (let i = 0; i < 40 && !log; i++) {
        log = await PincodeSyncLogModel.findOne({ trigger: "manual", status: "success" }).lean();
        if (!log) await new Promise((r) => setTimeout(r, 50));
      }
      expect(log).toBeTruthy();
      expect(await PincodeModel.countDocuments()).toBe(1);
    } finally {
      (env as { DATA_GOV_IN_API_KEY: string }).DATA_GOV_IN_API_KEY = saved;
    }
  });
});
