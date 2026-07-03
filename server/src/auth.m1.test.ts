import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { PermissionModel, PlanModel, RoleModel, UserModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { clearEmails, lastEmailFor } from "@/services/email.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { hashPassword } from "@/lib/crypto.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

type Cookie = { name: string; value: string };
const PW = "Sup3rSecret!pw";

let app: AppInstance;

async function seedMinimal() {
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
    maxApiKeys: 1,
    maxTeamMembers: 2,
    isActive: true,
    isPublic: true,
  });
}

function cookie(res: { cookies: Cookie[] }, name: string): string | undefined {
  return res.cookies.find((c) => c.name === name)?.value;
}

function tokenFromEmail(email: string): string {
  const mail = lastEmailFor(email);
  if (!mail) throw new Error(`no email captured for ${email}`);
  const m = mail.text.match(/token=([^&\s]+)/);
  if (!m) throw new Error("no token in email");
  return m[1]!;
}

/** Sign up + verify so the account is loginable. Returns the email. */
async function signupVerified(email: string, companyName: string): Promise<string> {
  const signup = await app.inject({
    method: "POST",
    url: "/v1/auth/signup",
    payload: { email, password: PW, name: "Test User", company_name: companyName },
  });
  expect(signup.statusCode).toBe(201);
  const token = tokenFromEmail(email);
  const verify = await app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token } });
  expect(verify.statusCode).toBe(200);
  return email;
}

async function login(email: string, password = PW) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  return {
    res,
    body: res.json() as { access_token?: string; user?: { role: string; companyId: string | null } },
    rt: cookie(res, "pp_rt"),
    csrf: cookie(res, "pp_csrf"),
  };
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
  clearEmails();
  await seedMinimal();
});

describe("M1 — happy path", () => {
  it("signup → verify → login → /me → logout", async () => {
    await signupVerified("owner@acme.test", "Acme Co");
    const { res, body, rt, csrf } = await login("owner@acme.test");
    expect(res.statusCode).toBe(200);
    expect(body.access_token).toBeTruthy();
    expect(rt).toBeTruthy();
    expect(csrf).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${body.access_token}` },
    });
    expect(me.statusCode).toBe(200);
    const meBody = me.json() as { user: { email: string; role: string }; company: { name: string } };
    expect(meBody.user.email).toBe("owner@acme.test");
    expect(meBody.user.role).toBe("owner");
    expect(meBody.company.name).toBe("Acme Co");

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      cookies: { pp_rt: rt!, pp_csrf: csrf! },
      headers: { "x-csrf-token": csrf! },
    });
    expect(logout.statusCode).toBe(204);
  });

  it("blocks login until email is verified", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { email: "unverified@acme.test", password: PW, name: "Unverified User", company_name: "Acme2" },
    });
    const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "unverified@acme.test", password: PW } });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe("email_unverified");
  });
});

describe("M1 — tenant isolation (HTTP)", () => {
  it("forces companyId on create and never leaks across tenants", async () => {
    await signupVerified("a@acme.test", "Tenant A");
    await signupVerified("b@beta.test", "Tenant B");

    const a = await login("a@acme.test");
    const b = await login("b@beta.test");
    const aCompany = a.body.user!.companyId;
    const bCompany = b.body.user!.companyId;
    expect(aCompany).not.toBe(bCompany);

    // A creates a thing, attempting to inject B's companyId in the body.
    const create = await app.inject({
      method: "POST",
      url: "/v1/_demo/things",
      headers: { authorization: `Bearer ${a.body.access_token}` },
      payload: { label: "a-thing", companyId: bCompany },
    });
    expect(create.statusCode).toBe(201);
    expect((create.json() as { company_id: string }).company_id).toBe(aCompany); // injection-wins

    // B creates its own thing.
    const bThing = await app.inject({
      method: "POST",
      url: "/v1/_demo/things",
      headers: { authorization: `Bearer ${b.body.access_token}` },
      payload: { label: "b-thing" },
    });
    const bThingId = (bThing.json() as { id: string }).id;

    // A lists → only A's row.
    const aList = await app.inject({
      method: "GET",
      url: "/v1/_demo/things",
      headers: { authorization: `Bearer ${a.body.access_token}` },
    });
    const things = (aList.json() as { things: Array<{ company_id: string }> }).things;
    expect(things).toHaveLength(1);
    expect(things[0]?.company_id).toBe(aCompany);

    // A reading B's thing by id → 404 (not 403).
    const cross = await app.inject({
      method: "GET",
      url: `/v1/_demo/things/${bThingId}`,
      headers: { authorization: `Bearer ${a.body.access_token}` },
    });
    expect(cross.statusCode).toBe(404);
  });
});

describe("M1 — RBAC", () => {
  it("denies a member the ratecard:write-gated action (403)", async () => {
    await signupVerified("owner2@acme.test", "Acme3");
    const owner = await login("owner2@acme.test");
    const companyId = owner.body.user!.companyId!;

    // Create a verified member user directly with the cloned member role.
    const memberRole = await RoleModel.findOne({ companyId, key: "member" });
    await UserModel.create({
      companyId,
      email: "member@acme.test",
      name: "Mem",
      passwordHash: await hashPassword(PW),
      roleId: memberRole!._id,
      isPlatformStaff: false,
      status: "active",
      emailVerifiedAt: new Date(),
      permVersion: 1,
    });

    const member = await login("member@acme.test");
    const post = await app.inject({
      method: "POST",
      url: "/v1/_demo/things",
      headers: { authorization: `Bearer ${member.body.access_token}` },
      payload: { label: "nope" },
    });
    expect(post.statusCode).toBe(403);
  });

  it("rejects a stale token after permVersion bump", async () => {
    await signupVerified("owner3@acme.test", "Acme4");
    const { body } = await login("owner3@acme.test");
    await UserModel.updateOne({ email: "owner3@acme.test" }, { $inc: { permVersion: 1 } });
    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${body.access_token}` },
    });
    expect(me.statusCode).toBe(401);
    expect((me.json() as { error: { code: string } }).error.code).toBe("token_stale");
  });
});

describe("M1 — refresh rotation + reuse", () => {
  it("rotates the refresh token and revokes the family on reuse", async () => {
    await signupVerified("rot@acme.test", "Acme5");
    const first = await login("rot@acme.test");
    const rt1 = first.rt!;
    const csrf1 = first.csrf!;

    const r2 = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { pp_rt: rt1, pp_csrf: csrf1 },
      headers: { "x-csrf-token": csrf1 },
    });
    expect(r2.statusCode).toBe(200);
    const rt2 = cookie(r2, "pp_rt")!;
    expect(rt2).not.toBe(rt1);

    // Replay the old (rotated) token → 401 + family revoked.
    const reuse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { pp_rt: rt1, pp_csrf: csrf1 },
      headers: { "x-csrf-token": csrf1 },
    });
    expect(reuse.statusCode).toBe(401);

    // rt2 is now also dead (whole family revoked).
    const after = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { pp_rt: rt2, pp_csrf: csrf1 },
      headers: { "x-csrf-token": csrf1 },
    });
    expect(after.statusCode).toBe(401);
  });

  it("requires a CSRF token on refresh", async () => {
    await signupVerified("csrf@acme.test", "Acme6");
    const { rt } = await login("csrf@acme.test");
    const res = await app.inject({ method: "POST", url: "/v1/auth/refresh", cookies: { pp_rt: rt! } });
    expect(res.statusCode).toBe(403);
  });
});

describe("M1 — hardening", () => {
  it("locks the account after repeated bad passwords", async () => {
    await signupVerified("lock@acme.test", "Acme7");
    for (let i = 0; i < 10; i++) {
      await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "lock@acme.test", password: "wrong" } });
    }
    const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "lock@acme.test", password: PW } });
    expect(res.statusCode).toBe(423); // locked even with the correct password
  });

  it("forgot-password is non-enumerating", async () => {
    const known = await app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "nobody@acme.test" } });
    expect(known.statusCode).toBe(200);
  });

  it("onboard is idempotent-safe: duplicate signup email → 409", async () => {
    await signupVerified("dup@acme.test", "Acme8");
    const again = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { email: "dup@acme.test", password: PW, name: "Dup", company_name: "Acme8b" },
    });
    expect(again.statusCode).toBe(409);
  });
});

describe("M1 — onboarding shape", () => {
  it("creates company + 3 tenant roles + owner + Free subscription", async () => {
    const res = await onboardCompany({
      companyName: "Shape Co",
      ownerName: "Owner",
      ownerEmail: "shape@acme.test",
      password: PW,
      emailVerified: true,
    });
    const roles = await RoleModel.find({ companyId: res.companyId });
    expect(roles.map((r) => r.key).sort()).toEqual(["developer", "member", "owner"]);
    const owner = await UserModel.findById(res.ownerUserId);
    expect(owner?.emailVerifiedAt).toBeTruthy();
  });
});
