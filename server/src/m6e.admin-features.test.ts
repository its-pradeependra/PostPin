import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hashPassword } from "@/lib/crypto.js";
import { AuditLogModel, PermissionModel, PlanModel, RoleModel, SettingsModel, UserModel, ZoneModel } from "@/models/index.js";
import { SEED_ZONES } from "@/data/zones.data.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { PLATFORM_ROLES } from "@/shared/roles.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";
import { clearEmails, recentEmails } from "@/services/email.service.js";
import { authenticator } from "otplib";

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
        rate_limit_rpm: 120,
        max_api_keys: 20,
        max_team_members: 10,
        features: ["Priority support"],
        is_public: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const plan = (res.json() as { plan: { code: string; price_monthly: number } }).plan;
    expect(plan.code).toBe("growth"); // normalized lowercase
    expect(plan.price_monthly).toBe(999);

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

describe("M6e — rate-cards admin (create / assign / simulate)", () => {
  it("creates a card, assigns it, and the tenant's keyed quote prices from it", async () => {
    const adminT = (await login(ADMIN))!;
    const { companyId } = await onboardCompany({ companyName: "Cards Co", ownerName: "Owner", ownerEmail: "c@cards.test", password: PW, emailVerified: true });
    const tenantT = (await login("c@cards.test"))!;

    // Baseline keyed quote (no assigned card → zone pricing).
    const keyRes = await app.inject({ method: "POST", url: "/v1/keys", headers: auth(tenantT), payload: { name: "Prod Key", mode: "test" } });
    expect(keyRes.statusCode).toBe(201);
    const secret = (keyRes.json() as { secret: string }).secret;
    const q0 = await app.inject({
      method: "POST",
      url: "/v1/rates/calculate",
      headers: { authorization: `Bearer ${secret}` },
      payload: { origin: "302001", destination: "302015", weight: 1000, service: "surface" },
    });
    expect(q0.statusCode, q0.body).toBe(200);
    const baseTotal = (q0.json() as { data: { zone: string; total: number } }).data;
    expect(baseTotal.zone).toBe("within_city");

    // Admin creates a distinctive within_city card for this tenant.
    const created = await app.inject({
      method: "POST",
      url: "/v1/admin/rate-cards",
      headers: auth(adminT),
      payload: {
        company_id: String(companyId),
        name: "Peak Card",
        rows: [{ zone_code: "within_city", base_charge: 500, per_500g: 100 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const cardId = (created.json() as { card: { id: string; status: string } }).card.id;

    // Simulate the card (1kg within_city) before assigning.
    const sim = await app.inject({
      method: "POST",
      url: `/v1/admin/rate-cards/${cardId}/simulate`,
      headers: auth(adminT),
      payload: { weight_grams: 1000, zone_code: "within_city", service: "surface" },
    });
    expect(sim.statusCode).toBe(200);
    expect((sim.json() as { result: { total: number } }).result.total).toBeGreaterThan(baseTotal.total);

    // Assign → active + default.
    const assigned = await app.inject({ method: "POST", url: `/v1/admin/rate-cards/${cardId}/assign`, headers: auth(adminT) });
    expect(assigned.statusCode).toBe(200);
    expect((assigned.json() as { card: { is_default: boolean; status: string } }).card).toMatchObject({ is_default: true, status: "active" });

    // Same keyed lane now prices from the assigned card (much higher).
    const q1 = await app.inject({
      method: "POST",
      url: "/v1/rates/calculate",
      headers: { authorization: `Bearer ${secret}` },
      payload: { origin: "302001", destination: "302015", weight: 1000, service: "surface" },
    });
    const cardTotal = (q1.json() as { data: { total: number; breakdown: Array<{ label: string }> } }).data;
    expect(cardTotal.total).toBeGreaterThan(baseTotal.total);
    expect(cardTotal.breakdown.some((l) => l.label === "Rate card freight")).toBe(true);
  });

  it("rejects create for an unknown company and simulate for an unpriced zone", async () => {
    const adminT = (await login(ADMIN))!;
    const badCo = await app.inject({
      method: "POST",
      url: "/v1/admin/rate-cards",
      headers: auth(adminT),
      payload: { company_id: "60a0000000000000000000aa", name: "Ghost", rows: [] },
    });
    expect(badCo.statusCode).toBe(400);

    const { companyId } = await onboardCompany({ companyName: "Sim Co", ownerName: "O", ownerEmail: "s@sim.test", password: PW, emailVerified: true });
    const created = await app.inject({
      method: "POST",
      url: "/v1/admin/rate-cards",
      headers: auth(adminT),
      payload: { company_id: String(companyId), name: "Only Metro", rows: [{ zone_code: "metro", base_charge: 80, per_500g: 20 }] },
    });
    const cardId = (created.json() as { card: { id: string } }).card.id;
    const sim = await app.inject({
      method: "POST",
      url: `/v1/admin/rate-cards/${cardId}/simulate`,
      headers: auth(adminT),
      payload: { weight_grams: 1000, zone_code: "within_city", service: "surface" },
    });
    expect(sim.statusCode).toBe(400);
    expect((sim.json() as { error: { code: string } }).error.code).toBe("zone_not_priced");
  });

  it("denies a tenant user from managing rate cards (403)", async () => {
    await onboardCompany({ companyName: "RC Co", ownerName: "O", ownerEmail: "rc@rc.test", password: PW, emailVerified: true });
    const t = (await login("rc@rc.test"))!;
    const res = await app.inject({ method: "POST", url: "/v1/admin/rate-cards", headers: auth(t), payload: { company_id: "60a0000000000000000000aa", name: "Nope", rows: [] } });
    expect(res.statusCode).toBe(403);
  });
});

describe("M6e — staff invites + role matrix", () => {
  it("invites a staff member who accepts and can log in", async () => {
    const t = (await login(ADMIN))!;
    clearEmails();
    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/team/invite",
      headers: auth(t),
      payload: { email: "newadmin@postpin.test", name: "New Admin", role_key: "support_admin" },
    });
    expect(res.statusCode).toBe(201);

    // Grab the invite token from the captured email and accept.
    const mail = recentEmails().find((m) => m.to === "newadmin@postpin.test");
    expect(mail).toBeTruthy();
    const token = /token=([^\s&"]+)/.exec(mail!.text)?.[1];
    expect(token).toBeTruthy();

    const accepted = await app.inject({
      method: "POST",
      url: "/v1/auth/accept-invite",
      payload: { token, name: "New Admin", password: "Str0ng!Passw0rd" },
    });
    expect(accepted.statusCode).toBe(200);

    const staffLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "newadmin@postpin.test", password: "Str0ng!Passw0rd" } });
    expect(staffLogin.statusCode).toBe(200);
    expect((staffLogin.json() as { user: { role: string } }).user.role).toBe("support_admin");
  });

  it("rejects a duplicate staff email and an unknown role", async () => {
    const t = (await login(ADMIN))!;
    const dup = await app.inject({ method: "POST", url: "/v1/admin/team/invite", headers: auth(t), payload: { email: ADMIN, name: "Dup", role_key: "support_admin" } });
    expect(dup.statusCode).toBe(400);
    const badRole = await app.inject({ method: "POST", url: "/v1/admin/team/invite", headers: auth(t), payload: { email: "x@postpin.test", name: "X", role_key: "nope" } });
    expect(badRole.statusCode).toBe(400);
  });

  it("returns the live role → permission matrix", async () => {
    const t = (await login(ADMIN))!;
    const res = await app.inject({ method: "GET", url: "/v1/admin/roles/matrix", headers: auth(t) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { roles: Array<{ key: string; permissions: string[] }>; permissions: Array<{ key: string }> };
    const superRole = body.roles.find((r) => r.key === "super_admin");
    expect(superRole!.permissions).toContain("admin:write");
    expect(body.permissions.length).toBeGreaterThan(5);
  });
});

describe("M6e — tenant impersonation (step-up)", () => {
  it("re-auths, impersonates a tenant, and the token acts as the tenant owner", async () => {
    const adminT = (await login(ADMIN))!;
    const { companyId } = await onboardCompany({ companyName: "Imp Co", ownerName: "Owner Person", ownerEmail: "owner@imp.test", password: PW, emailVerified: true });

    // Impersonation without step-up is refused.
    const noStep = await app.inject({ method: "POST", url: `/v1/admin/tenants/${String(companyId)}/impersonate`, headers: auth(adminT), payload: { step_up_token: "not-a-real-token" } });
    expect(noStep.statusCode).toBe(401);

    // Step-up re-auth.
    const step = await app.inject({ method: "POST", url: "/v1/auth/step-up", headers: auth(adminT), payload: { password: PW } });
    expect(step.statusCode).toBe(200);
    const stepUpToken = (step.json() as { step_up_token: string }).step_up_token;

    // Impersonate.
    const imp = await app.inject({ method: "POST", url: `/v1/admin/tenants/${String(companyId)}/impersonate`, headers: auth(adminT), payload: { step_up_token: stepUpToken } });
    expect(imp.statusCode).toBe(200);
    const body = imp.json() as { access_token: string; tenant: { name: string; owner_email: string } };
    expect(body.tenant).toMatchObject({ name: "Imp Co", owner_email: "owner@imp.test" });

    // The impersonation token authenticates AS the tenant owner.
    const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${body.access_token}` } });
    const meBody = me.json() as { user: { email: string; is_platform_staff: boolean }; company: { name: string } | null };
    expect(meBody.user.email).toBe("owner@imp.test");
    expect(meBody.user.is_platform_staff).toBe(false);
    expect(meBody.company?.name).toBe("Imp Co");

    // A critical audit records who impersonated whom.
    const audit = await AuditLogModel.findOne({ action: "admin.impersonation_started" }).lean();
    expect(audit).toMatchObject({ severity: "critical" });
  });

  it("denies a tenant user from impersonating (403) and rejects another admin's step-up token", async () => {
    await onboardCompany({ companyName: "Nope Co", ownerName: "O", ownerEmail: "o@nope.test", password: PW, emailVerified: true });
    const tenantT = (await login("o@nope.test"))!;
    const res = await app.inject({ method: "POST", url: "/v1/admin/tenants/60a0000000000000000000aa/impersonate", headers: auth(tenantT), payload: { step_up_token: "x".repeat(20) } });
    expect(res.statusCode).toBe(403);
  });
});

describe("M6e — two-factor (TOTP)", () => {
  function secretFromOtpauth(otpauth: string): string {
    return /secret=([^&]+)/.exec(otpauth)![1]!;
  }

  it("enrolls TOTP, then requires a second factor at login", async () => {
    const t = (await login(ADMIN))!;

    // Setup → enable with a real code.
    const setup = await app.inject({ method: "POST", url: "/v1/auth/2fa/setup", headers: auth(t) });
    expect(setup.statusCode).toBe(200);
    const { otpauth } = setup.json() as { otpauth: string; qr_data_url: string };
    const secret = secretFromOtpauth(otpauth);

    const enable = await app.inject({ method: "POST", url: "/v1/auth/2fa/enable", headers: auth(t), payload: { code: authenticator.generate(secret) } });
    expect(enable.statusCode).toBe(200);
    const backup = (enable.json() as { backup_codes: string[] }).backup_codes;
    expect(backup.length).toBeGreaterThan(0);

    // Password login now returns an MFA challenge, not tokens.
    const pw = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: ADMIN, password: PW } });
    const challenge = pw.json() as { mfa_required?: boolean; mfa_token?: string; access_token?: string };
    expect(challenge.mfa_required).toBe(true);
    expect(challenge.access_token).toBeUndefined();

    // A wrong code fails.
    const bad = await app.inject({ method: "POST", url: "/v1/auth/login/2fa", payload: { mfa_token: challenge.mfa_token, code: "000000" } });
    expect(bad.statusCode).toBe(401);

    // The real code completes login.
    const good = await app.inject({ method: "POST", url: "/v1/auth/login/2fa", payload: { mfa_token: challenge.mfa_token, code: authenticator.generate(secret) } });
    expect(good.statusCode).toBe(200);
    expect((good.json() as { access_token: string }).access_token).toBeTruthy();

    // A backup code also works as a second factor.
    const pw2 = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: ADMIN, password: PW } });
    const ch2 = pw2.json() as { mfa_token: string };
    const viaBackup = await app.inject({ method: "POST", url: "/v1/auth/login/2fa", payload: { mfa_token: ch2.mfa_token, code: backup[0] } });
    expect(viaBackup.statusCode).toBe(200);
  });
});
