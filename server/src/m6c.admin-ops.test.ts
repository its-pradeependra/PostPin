import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hashPassword } from "@/lib/crypto.js";
import { PermissionModel, PincodeModel, PlanModel, RoleModel, SettingsModel, UserModel, ZoneModel } from "@/models/index.js";
import { SEED_ZONES } from "@/data/zones.data.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { PLATFORM_ROLES } from "@/shared/roles.js";
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
  await ZoneModel.insertMany(SEED_ZONES.map((z) => ({ code: z.code, name: z.name, tier: z.tier, description: z.description, resolution: { priority: z.resolution.priority }, slaDays: z.slaDays, isSpecial: z.isSpecial, isActive: true })));
  await SettingsModel.create({ scope: "platform", companyId: null, key: "pincode.sync", value: { source: "manual CSV import", schedule: "manual" }, editableBy: "super_admin" });
}

async function login(email: string, password = PW) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  return (res.json() as { access_token?: string }).access_token;
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

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

describe("M6c — pincode master", () => {
  it("imports a CSV as a real sync run (upserts + sync log + stats + search)", async () => {
    const t = (await login(ADMIN))!;
    const csv = [
      "pincode,officeName,district,state,city,isMetro",
      "110001,Connaught Place,New Delhi,Delhi,New Delhi,true",
      "560001,Bangalore GPO,Bangalore,Karnataka,Bengaluru,true",
      "999999x,Bad Row,Nowhere,None,None,false", // invalid → counted as failed
    ].join("\n");

    const res = await app.inject({ method: "POST", url: "/v1/admin/pincodes/import", headers: auth(t), payload: { csv } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { sync_id: string; counts: { scanned: number; added: number; failed: number } };
    expect(body.counts).toMatchObject({ scanned: 3, added: 2, failed: 1 });

    // Re-import with a change → updated, not added.
    const csv2 = ["pincode,officeName,district,state,city,isMetro", "110001,CP Head Office,New Delhi,Delhi,New Delhi,true"].join("\n");
    const res2 = await app.inject({ method: "POST", url: "/v1/admin/pincodes/import", headers: auth(t), payload: { csv: csv2 } });
    expect((res2.json() as { counts: { updated: number; added: number } }).counts).toMatchObject({ updated: 1, added: 0 });

    const stats = await app.inject({ method: "GET", url: "/v1/admin/pincodes/stats", headers: auth(t) });
    const s = stats.json() as { total: number; metros: number; last_sync: { status: string; trigger: string } };
    expect(s.total).toBe(2);
    expect(s.metros).toBe(2);
    expect(s.last_sync).toMatchObject({ status: "success", trigger: "import" });

    const logs = await app.inject({ method: "GET", url: "/v1/admin/pincodes/sync-logs", headers: auth(t) });
    expect((logs.json() as { logs: unknown[] }).logs).toHaveLength(2);

    const search = await app.inject({ method: "GET", url: "/v1/admin/pincodes/search?q=1100", headers: auth(t) });
    const found = (search.json() as { pincodes: Array<{ pincode: string; office_name: string }> }).pincodes;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ pincode: "110001", office_name: "CP Head Office" });
  });

  it("reads and updates sync settings", async () => {
    const t = (await login(ADMIN))!;
    const before = await app.inject({ method: "GET", url: "/v1/admin/pincodes/sync-settings", headers: auth(t) });
    expect((before.json() as { settings: { schedule: string } }).settings.schedule).toBe("manual");
    const upd = await app.inject({ method: "PATCH", url: "/v1/admin/pincodes/sync-settings", headers: auth(t), payload: { notificationEmail: "ops@postpin.dev" } });
    expect((upd.json() as { settings: { notificationEmail: string } }).settings.notificationEmail).toBe("ops@postpin.dev");
  });
});

describe("M6c — zones + rate-cards overview", () => {
  it("lists real zones joined with live engine pricing", async () => {
    const t = (await login(ADMIN))!;
    const res = await app.inject({ method: "GET", url: "/v1/admin/zones", headers: auth(t) });
    const zones = (res.json() as { zones: Array<{ code: string; base_charge: number | null; per_kg: number | null }> }).zones;
    expect(zones).toHaveLength(5);
    expect(zones.find((z) => z.code === "within_city")).toMatchObject({ base_charge: 35, per_kg: 22 });
  });

  it("returns the standard rate card + cross-tenant custom cards", async () => {
    const adminT = (await login(ADMIN))!;
    await onboardCompany({ companyName: "Cards Co", ownerName: "Owner", ownerEmail: "c@cards.test", password: PW, emailVerified: true });
    const tenantT = (await login("c@cards.test"))!;
    await app.inject({ method: "POST", url: "/v1/rate-cards", headers: auth(tenantT), payload: { name: "Peak Card" } });

    const res = await app.inject({ method: "GET", url: "/v1/admin/rate-cards", headers: auth(adminT) });
    const body = res.json() as { standard: unknown[]; custom: Array<{ name: string; company_name: string }> };
    expect(body.standard).toHaveLength(5);
    expect(body.custom[0]).toMatchObject({ name: "Peak Card", company_name: "Cards Co" });
  });
});

describe("M6c — API-key audit + force revoke", () => {
  it("lists keys cross-tenant and force-revokes one (tenant's key stops working)", async () => {
    const adminT = (await login(ADMIN))!;
    await onboardCompany({ companyName: "Keys Co", ownerName: "Owner", ownerEmail: "k@keys.test", password: PW, emailVerified: true });
    const tenantT = (await login("k@keys.test"))!;
    const created = await app.inject({ method: "POST", url: "/v1/keys", headers: auth(tenantT), payload: { name: "Prod Key", mode: "test" } });
    const secret = (created.json() as { secret: string }).secret;

    const list = await app.inject({ method: "GET", url: "/v1/admin/api-keys", headers: auth(adminT) });
    const keys = (list.json() as { keys: Array<{ id: string; company_name: string; status: string }> }).keys;
    expect(keys[0]).toMatchObject({ company_name: "Keys Co", status: "active" });

    // Key works before revoke…
    const ok = await app.inject({ method: "POST", url: "/v1/rates/calculate", headers: { authorization: `Bearer ${secret}` }, payload: { origin: "110001", destination: "560001", weight: 500, service: "surface" } });
    expect(ok.statusCode).toBe(200);

    const revoked = await app.inject({ method: "POST", url: `/v1/admin/api-keys/${keys[0]!.id}/revoke`, headers: auth(adminT) });
    expect(revoked.statusCode).toBe(200);

    // …and dies after.
    const dead = await app.inject({ method: "POST", url: "/v1/rates/calculate", headers: { authorization: `Bearer ${secret}` }, payload: { origin: "110001", destination: "560001", weight: 500, service: "surface" } });
    expect(dead.statusCode).toBe(401);
  });
});

describe("M6c — platform team + settings", () => {
  it("lists staff with roles, changes a role, and protects the last super admin", async () => {
    const adminT = (await login(ADMIN))!;
    // Add a second staff member directly (invite flow is a deferral).
    const supportRole = await RoleModel.findOne({ companyId: null, key: "support_admin" });
    await UserModel.create({ companyId: null, email: "helper@postpin.test", name: "Helper", passwordHash: await hashPassword(PW), roleId: supportRole!._id, isPlatformStaff: true, status: "active", emailVerifiedAt: new Date() });

    const team = await app.inject({ method: "GET", url: "/v1/admin/team", headers: auth(adminT) });
    const body = team.json() as { staff: Array<{ id: string; email: string; role: string }>; roles: Array<{ key: string }> };
    expect(body.staff).toHaveLength(2);
    expect(body.roles.map((r) => r.key)).toContain("billing_admin");

    const helper = body.staff.find((s) => s.email === "helper@postpin.test")!;
    const promoted = await app.inject({ method: "PATCH", url: `/v1/admin/team/${helper.id}/role`, headers: auth(adminT), payload: { role: "billing_admin" } });
    expect((promoted.json() as { role: string }).role).toBe("billing_admin");

    // Last-super-admin guard: the root admin can't be demoted (only super admin left) — and can't change own role anyway.
    const me = body.staff.find((s) => s.email === ADMIN)!;
    const selfChange = await app.inject({ method: "PATCH", url: `/v1/admin/team/${me.id}/role`, headers: auth(adminT), payload: { role: "read_only" } });
    expect(selfChange.statusCode).toBe(400);
  });

  it("lists and updates platform settings (audited)", async () => {
    const t = (await login(ADMIN))!;
    const list = await app.inject({ method: "GET", url: "/v1/admin/settings", headers: auth(t) });
    const settings = (list.json() as { settings: Array<{ key: string }> }).settings;
    expect(settings.map((s) => s.key)).toContain("pincode.sync");

    const upd = await app.inject({ method: "PATCH", url: "/v1/admin/settings/pincode.sync", headers: auth(t), payload: { schedule: "nightly" } });
    expect((upd.json() as { value: { schedule: string } }).value.schedule).toBe("nightly");
    expect((await app.inject({ method: "PATCH", url: "/v1/admin/settings/nope.key", headers: auth(t), payload: { a: 1 } })).statusCode).toBe(404);
  });
});

describe("M6c — authz", () => {
  it("blocks tenant users from all ops surfaces", async () => {
    await onboardCompany({ companyName: "Nope Co", ownerName: "Owner", ownerEmail: "n@nope.test", password: PW, emailVerified: true });
    const t = (await login("n@nope.test"))!;
    for (const url of ["/v1/admin/pincodes/stats", "/v1/admin/zones", "/v1/admin/api-keys", "/v1/admin/team", "/v1/admin/settings", "/v1/admin/rate-cards"]) {
      expect((await app.inject({ method: "GET", url, headers: auth(t) })).statusCode).toBe(403);
    }
  });
});

void PincodeModel;
