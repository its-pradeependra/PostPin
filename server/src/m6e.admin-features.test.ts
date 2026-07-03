import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hashPassword } from "@/lib/crypto.js";
import { PermissionModel, PlanModel, RoleModel, SettingsModel, UserModel, ZoneModel } from "@/models/index.js";
import { SEED_ZONES } from "@/data/zones.data.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { PLATFORM_ROLES } from "@/shared/roles.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";
import { clearEmails, recentEmails } from "@/services/email.service.js";

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

describe("M6e — plan create", () => {
  it("creates a new plan (201), converts rupees→paise, and lists it", async () => {
    const t = (await login(ADMIN))!;
    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/plans",
      headers: auth(t),
      payload: {
        code: "Growth",
        name: "Growth",
        description: "For scaling teams",
        price_monthly: 999,
        price_yearly: 9990,
        included_calls: 50000,
        overage_per_1k: 20,
        rate_limit_rpm: 120,
        max_api_keys: 20,
        max_team_members: 10,
        features: ["Priority support"],
        is_public: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const plan = (res.json() as { plan: { code: string; price_monthly: number; overage_per_1k: number } }).plan;
    expect(plan.code).toBe("growth"); // normalized lowercase
    expect(plan.price_monthly).toBe(999);
    expect(plan.overage_per_1k).toBe(20);

    // Stored in paise.
    const doc = await PlanModel.findOne({ code: "growth" }).lean();
    expect(doc!.priceMonthlyPaise).toBe(99900);

    const list = await app.inject({ method: "GET", url: "/v1/admin/plans", headers: auth(t) });
    expect((list.json() as { plans: Array<{ code: string }> }).plans.some((p) => p.code === "growth")).toBe(true);
  });

  it("rejects a duplicate code (400 plan_exists) and a bad slug", async () => {
    const t = (await login(ADMIN))!;
    const dup = await app.inject({ method: "POST", url: "/v1/admin/plans", headers: auth(t), payload: { code: "free", name: "Dupe" } });
    expect(dup.statusCode).toBe(400);
    expect((dup.json() as { error: { code: string } }).error.code).toBe("plan_exists");

    const bad = await app.inject({ method: "POST", url: "/v1/admin/plans", headers: auth(t), payload: { code: "9bad!", name: "Bad" } });
    expect(bad.statusCode).toBe(400);
  });

  it("denies a tenant user (403)", async () => {
    await onboardCompany({ companyName: "T Co", ownerName: "O", ownerEmail: "o@t.test", password: PW, emailVerified: true });
    const t = (await login("o@t.test"))!;
    const res = await app.inject({ method: "POST", url: "/v1/admin/plans", headers: auth(t), payload: { code: "x1", name: "Xyz" } });
    expect(res.statusCode).toBe(403);
  });
});

describe("M6e — zone editor reprices the live engine", () => {
  it("edits a zone's base/per-kg and the public quote reflects it", async () => {
    const t = (await login(ADMIN))!;

    // Baseline metro quote (110001 → 400001 are both metros in a fresh seed → roi
    // unless metro pincodes exist; use within_city by same first-3 to be deterministic).
    const before = await app.inject({
      method: "POST",
      url: "/v1/public/rates/calculate",
      payload: { origin: "302001", destination: "302015", weight: 1000, service: "surface" },
    });
    const beforeTotal = (before.json() as { data: { zone: string; total: number } }).data;
    expect(beforeTotal.zone).toBe("within_city");

    // Double the within_city base charge + per-kg.
    const patched = await app.inject({
      method: "PATCH",
      url: "/v1/admin/zones/within_city",
      headers: auth(t),
      payload: { base_charge: 70, per_kg: 44 },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { zone: { base_charge: number } }).zone.base_charge).toBe(70);

    // Same lane now quotes higher (pricing came from the DB, not the static seed).
    const after = await app.inject({
      method: "POST",
      url: "/v1/public/rates/calculate",
      payload: { origin: "302001", destination: "302015", weight: 1000, service: "surface" },
    });
    const afterTotal = (after.json() as { data: { total: number } }).data.total;
    expect(afterTotal).toBeGreaterThan(beforeTotal.total);
  });

  it("denies a non-permitted user (403)", async () => {
    await onboardCompany({ companyName: "Z Co", ownerName: "O", ownerEmail: "z@z.test", password: PW, emailVerified: true });
    const t = (await login("z@z.test"))!;
    const res = await app.inject({ method: "PATCH", url: "/v1/admin/zones/within_city", headers: auth(t), payload: { base_charge: 10 } });
    expect(res.statusCode).toBe(403);
  });
});

describe("M6e — platform settings (scalar + array + nested)", () => {
  beforeEach(async () => {
    await SettingsModel.create({
      scope: "platform",
      companyId: null,
      key: "engine.defaults",
      value: { gstBps: 1800, fuelBps: 1200, tiers: ["a", "b"], caps: { max: 5, min: 1 } },
      editableBy: "super_admin",
    });
  });

  it("merges a scalar edit and replaces an array/nested field, leaving others intact", async () => {
    const t = (await login(ADMIN))!;
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/admin/settings/engine.defaults",
      headers: auth(t),
      payload: { gstBps: 2000, tiers: ["a", "b", "c"], caps: { max: 9, min: 1 } },
    });
    expect(res.statusCode).toBe(200);

    const doc = await SettingsModel.findOne({ scope: "platform", key: "engine.defaults" }).lean();
    const v = doc!.value as { gstBps: number; fuelBps: number; tiers: string[]; caps: { max: number; min: number } };
    expect(v.gstBps).toBe(2000); // edited
    expect(v.fuelBps).toBe(1200); // untouched (shallow merge keeps it)
    expect(v.tiers).toEqual(["a", "b", "c"]); // array replaced
    expect(v.caps).toEqual({ max: 9, min: 1 }); // nested replaced
  });

  it("returns 404 for an unknown setting key", async () => {
    const t = (await login(ADMIN))!;
    const res = await app.inject({ method: "PATCH", url: "/v1/admin/settings/does.not.exist", headers: auth(t), payload: { x: 1 } });
    expect(res.statusCode).toBe(404);
  });
});

describe("M6e — notification channels (platform alerts)", () => {
  it("returns defaults, validates, and delivers a test email through the configured channel", async () => {
    const t = (await login(ADMIN))!;

    const def = await app.inject({ method: "GET", url: "/v1/admin/notifications/config", headers: auth(t) });
    const cfg = (def.json() as { config: { email: { enabled: boolean }; events: Record<string, boolean> } }).config;
    expect(cfg.email.enabled).toBe(false);
    expect(cfg.events["pincode.sync.failed"]).toBe(true);

    // Enabling email with no recipients is rejected.
    const bad = await app.inject({ method: "PATCH", url: "/v1/admin/notifications/config", headers: auth(t), payload: { email: { enabled: true } } });
    expect(bad.statusCode).toBe(400);

    // Invalid recipient rejected.
    const badEmail = await app.inject({ method: "PATCH", url: "/v1/admin/notifications/config", headers: auth(t), payload: { email: { recipients: ["not-an-email"] } } });
    expect(badEmail.statusCode).toBe(400);

    // Valid: enable email with a recipient, lower the bar to info.
    const ok = await app.inject({
      method: "PATCH",
      url: "/v1/admin/notifications/config",
      headers: auth(t),
      payload: { email: { enabled: true, recipients: ["ops@postpin.dev"], minSeverity: "info" } },
    });
    expect(ok.statusCode).toBe(200);

    // Test send actually delivers (captured in the dev inbox).
    clearEmails();
    const test = await app.inject({ method: "POST", url: "/v1/admin/notifications/test", headers: auth(t) });
    expect((test.json() as { result: { email: boolean } }).result.email).toBe(true);
    expect(recentEmails().some((m) => m.to === "ops@postpin.dev")).toBe(true);
  });

  it("rejects enabling Slack without a webhook and a bad webhook URL", async () => {
    const t = (await login(ADMIN))!;
    const noHook = await app.inject({ method: "PATCH", url: "/v1/admin/notifications/config", headers: auth(t), payload: { slack: { enabled: true } } });
    expect(noHook.statusCode).toBe(400);
    const badHook = await app.inject({ method: "PATCH", url: "/v1/admin/notifications/config", headers: auth(t), payload: { slack: { webhookUrl: "ftp://nope" } } });
    expect(badHook.statusCode).toBe(400);
  });

  it("denies a non-permitted user (403)", async () => {
    await onboardCompany({ companyName: "N Co", ownerName: "O", ownerEmail: "n@n.test", password: PW, emailVerified: true });
    const t = (await login("n@n.test"))!;
    const res = await app.inject({ method: "GET", url: "/v1/admin/notifications/config", headers: auth(t) });
    expect(res.statusCode).toBe(403);
  });
});
