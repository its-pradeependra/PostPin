import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hashPassword } from "@/lib/crypto.js";
import { PermissionModel, PlanModel, RoleModel, UserModel } from "@/models/index.js";
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
}

async function login(email: string, body: Record<string, unknown> = {}) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PW, ...body } });
  return res;
}
const tokenOf = (res: { json: () => unknown }) => (res.json() as { access_token?: string }).access_token;
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

// ────────────────────────────────────────────────────────────────────────────
describe("M6g — marketing consent is stored and honored", () => {
  it("signup records the consent flag (and defaults off when omitted)", async () => {
    const yes = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { email: "opt@in.test", password: PW, name: "Opt In", company_name: "OptCo", marketing_consent: true },
    });
    expect(yes.statusCode).toBe(201);
    const optedIn = await UserModel.findOne({ email: "opt@in.test" }).lean();
    expect(optedIn!.marketingConsent).toBe(true);
    expect(optedIn!.marketingConsentAt).toBeTruthy();

    const no = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { email: "opt@out.test", password: PW, name: "Opt Out", company_name: "OutCo" },
    });
    expect(no.statusCode).toBe(201);
    const optedOut = await UserModel.findOne({ email: "opt@out.test" }).lean();
    expect(optedOut!.marketingConsent).toBe(false);
    expect(optedOut!.marketingConsentAt).toBeNull();
  });

  it("/me exposes it and PATCH /auth/profile toggles it", async () => {
    await onboardCompany({ companyName: "Toggle Co", ownerName: "O", ownerEmail: "t@toggle.test", password: PW, emailVerified: true });
    const t = tokenOf(await login("t@toggle.test"))!;

    const me1 = await app.inject({ method: "GET", url: "/v1/auth/me", headers: auth(t) });
    expect((me1.json() as { user: { marketing_consent: boolean } }).user.marketing_consent).toBe(false);

    const on = await app.inject({ method: "PATCH", url: "/v1/auth/profile", headers: auth(t), payload: { marketing_consent: true } });
    expect((on.json() as { user: { marketing_consent: boolean } }).user.marketing_consent).toBe(true);

    const me2 = await app.inject({ method: "GET", url: "/v1/auth/me", headers: auth(t) });
    expect((me2.json() as { user: { marketing_consent: boolean } }).user.marketing_consent).toBe(true);

    const off = await app.inject({ method: "PATCH", url: "/v1/auth/profile", headers: auth(t), payload: { marketing_consent: false } });
    expect((off.json() as { user: { marketing_consent: boolean } }).user.marketing_consent).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("M6g — remember me controls cookie persistence", () => {
  const refreshCookie = (res: { cookies: Array<{ name: string; expires?: Date; maxAge?: number }> }) =>
    res.cookies.find((c) => c.name === "pp_rt");

  it("remember:true sets a persistent cookie; remember:false sets a session cookie", async () => {
    await onboardCompany({ companyName: "Remember Co", ownerName: "O", ownerEmail: "r@remember.test", password: PW, emailVerified: true });

    const persistent = await login("r@remember.test", { remember: true });
    const pc = refreshCookie(persistent);
    expect(pc).toBeTruthy();
    // Persistent → has an expiry (~30 days out).
    expect(pc!.expires || pc!.maxAge).toBeTruthy();

    const session = await login("r@remember.test", { remember: false });
    const sc = refreshCookie(session);
    expect(sc).toBeTruthy();
    // Session cookie → NO expiry (cleared on browser close).
    expect(sc!.expires).toBeUndefined();
    expect(sc!.maxAge).toBeUndefined();
  });

  it("the remember choice is stored on the session and survives a token refresh", async () => {
    await onboardCompany({ companyName: "Persist Co", ownerName: "O", ownerEmail: "p@persist.test", password: PW, emailVerified: true });
    const res = await login("p@persist.test", { remember: false });
    const rt = res.cookies.find((c) => c.name === "pp_rt")!.value;
    const csrf = res.cookies.find((c) => c.name === "pp_csrf")!.value;

    const refreshed = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: { "x-csrf-token": csrf },
      cookies: { pp_rt: rt, pp_csrf: csrf },
    });
    expect(refreshed.statusCode).toBe(200);
    // Rotation must keep it a session cookie (no expiry carried over).
    const newRt = refreshed.cookies.find((c) => c.name === "pp_rt")!;
    expect(newRt.expires).toBeUndefined();
    expect(newRt.maxAge).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("M6g — product-update broadcast reaches ONLY opted-in users", () => {
  it("counts the audience and emails only consenting active users", async () => {
    // Two opted-in, one opted-out.
    await onboardCompany({ companyName: "A", ownerName: "A", ownerEmail: "a@x.test", password: PW, emailVerified: true, marketingConsent: true });
    await onboardCompany({ companyName: "B", ownerName: "B", ownerEmail: "b@x.test", password: PW, emailVerified: true, marketingConsent: true });
    await onboardCompany({ companyName: "C", ownerName: "C", ownerEmail: "c@x.test", password: PW, emailVerified: true, marketingConsent: false });

    const adminT = tokenOf(await login(ADMIN))!;

    const audience = await app.inject({ method: "GET", url: "/v1/admin/broadcast/audience", headers: auth(adminT) });
    expect((audience.json() as { recipients: number }).recipients).toBe(2);

    clearEmails();
    const send = await app.inject({
      method: "POST",
      url: "/v1/admin/broadcast",
      headers: auth(adminT),
      payload: { subject: "What's new", body: "We shipped nightly India Post sync and more." },
    });
    expect(send.statusCode).toBe(200);
    expect((send.json() as { sent: number }).sent).toBe(2);

    const to = recentEmails().map((m) => m.to).sort();
    expect(to).toEqual(["a@x.test", "b@x.test"]);
    expect(to).not.toContain("c@x.test");
  });

  it("denies a tenant user (403)", async () => {
    await onboardCompany({ companyName: "T", ownerName: "O", ownerEmail: "t@t.test", password: PW, emailVerified: true });
    const t = tokenOf(await login("t@t.test"))!;
    const res = await app.inject({ method: "POST", url: "/v1/admin/broadcast", headers: auth(t), payload: { subject: "Hi there", body: "Trying to broadcast without rights." } });
    expect(res.statusCode).toBe(403);
  });
});
