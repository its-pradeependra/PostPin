import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { PermissionModel, PlanModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
let app: AppInstance;

async function seed() {
  await PermissionModel.insertMany(
    PERMISSIONS.map((p) => ({
      key: p.key,
      resource: p.resource,
      action: p.action,
      group: p.group,
      scope: p.scope,
      description: p.description,
      isDangerous: "isDangerous" in p ? p.isDangerous : false,
    })),
  );
  await PlanModel.create({
    code: "free",
    version: 1,
    name: "Free",
    priceMonthlyPaise: 0,
    includedCalls: 1000,
    rateLimit: { rpm: 30, rpd: 0, burst: 10 },
    maxApiKeys: 10,
    maxTeamMembers: 2,
    isActive: true,
    isPublic: true,
  });
}

async function onboard(name: string, email: string) {
  await onboardCompany({ companyName: name, ownerName: "Owner", ownerEmail: email, password: PW, emailVerified: true });
}
async function login(email: string, password = PW) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  return { status: res.statusCode, token: (res.json() as { access_token?: string }).access_token };
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

describe("M5 — account profile", () => {
  it("requires auth and updates the profile", async () => {
    const noAuth = await app.inject({ method: "PATCH", url: "/v1/auth/profile", payload: { name: "Nobody" } });
    expect(noAuth.statusCode).toBe(401);

    await onboard("Alpha Co", "a@alpha.test");
    const { token } = await login("a@alpha.test");
    const t = token!;

    const patched = await app.inject({
      method: "PATCH",
      url: "/v1/auth/profile",
      headers: auth(t),
      payload: { name: "Aarav Sharma", locale: "hi-IN", timezone: "Asia/Dubai" },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { user: { name: string; timezone: string } }).user).toMatchObject({
      name: "Aarav Sharma",
      timezone: "Asia/Dubai",
    });

    const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers: auth(t) });
    expect((me.json() as { user: { name: string; locale: string } }).user).toMatchObject({ name: "Aarav Sharma", locale: "hi-IN" });
  });
});

describe("M5 — change password", () => {
  it("rejects a wrong current password and weak/same new passwords", async () => {
    await onboard("Beta Co", "b@beta.test");
    const { token } = await login("b@beta.test");
    const t = token!;

    const wrong = await app.inject({ method: "POST", url: "/v1/auth/change-password", headers: auth(t), payload: { current_password: "nope-wrong", new_password: "Brand#New#Pw9" } });
    expect(wrong.statusCode).toBe(400);
    const weak = await app.inject({ method: "POST", url: "/v1/auth/change-password", headers: auth(t), payload: { current_password: PW, new_password: "short" } });
    expect(weak.statusCode).toBe(400);
    const same = await app.inject({ method: "POST", url: "/v1/auth/change-password", headers: auth(t), payload: { current_password: PW, new_password: PW } });
    expect(same.statusCode).toBe(400);
  });

  it("changes the password so the old one no longer works", async () => {
    await onboard("Gamma Co", "g@gamma.test");
    const { token } = await login("g@gamma.test");
    const NEW = "Fresh#Passw0rd!";
    const res = await app.inject({ method: "POST", url: "/v1/auth/change-password", headers: auth(token!), payload: { current_password: PW, new_password: NEW } });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);

    expect((await login("g@gamma.test", PW)).status).toBe(401); // old password rejected
    expect((await login("g@gamma.test", NEW)).status).toBe(200); // new password works
  });
});

describe("M5 — active sessions", () => {
  it("lists sessions, marks the current one, revokes others and blocks self-revoke", async () => {
    await onboard("Sess Co", "s@sess.test");
    const { token: t1 } = await login("s@sess.test"); // session 1 (current for t1)
    await login("s@sess.test"); // session 2
    await login("s@sess.test"); // session 3

    const list = await app.inject({ method: "GET", url: "/v1/auth/sessions", headers: auth(t1!) });
    const sessions = (list.json() as { sessions: Array<{ id: string; current: boolean }> }).sessions;
    expect(sessions.length).toBe(3);
    const currents = sessions.filter((s) => s.current);
    expect(currents).toHaveLength(1);
    const currentId = currents[0]!.id;
    const otherId = sessions.find((s) => !s.current)!.id;

    // Can't revoke the session you're using.
    const self = await app.inject({ method: "POST", url: `/v1/auth/sessions/${currentId}/revoke`, headers: auth(t1!) });
    expect(self.statusCode).toBe(400);

    // Revoke one other session.
    const one = await app.inject({ method: "POST", url: `/v1/auth/sessions/${otherId}/revoke`, headers: auth(t1!) });
    expect(one.statusCode).toBe(200);
    const list2 = await app.inject({ method: "GET", url: "/v1/auth/sessions", headers: auth(t1!) });
    expect((list2.json() as { sessions: unknown[] }).sessions).toHaveLength(2);

    // Revoke all others → only the current remains.
    const rest = await app.inject({ method: "POST", url: "/v1/auth/sessions/revoke-others", headers: auth(t1!) });
    expect((rest.json() as { revoked: number }).revoked).toBe(1);
    const list3 = await app.inject({ method: "GET", url: "/v1/auth/sessions", headers: auth(t1!) });
    const final = (list3.json() as { sessions: Array<{ current: boolean }> }).sessions;
    expect(final).toHaveLength(1);
    expect(final[0]!.current).toBe(true);
  });

  it("keeps sessions private to each user", async () => {
    await onboard("Iso A", "a@iso.test");
    await onboard("Iso B", "b@iso.test");
    await login("a@iso.test");
    const { token: tb } = await login("b@iso.test");
    const bList = await app.inject({ method: "GET", url: "/v1/auth/sessions", headers: auth(tb!) });
    expect((bList.json() as { sessions: unknown[] }).sessions).toHaveLength(1); // only B's own
  });
});
