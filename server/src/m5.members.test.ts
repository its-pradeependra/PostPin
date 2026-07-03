import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { PermissionModel, PlanModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { clearEmails, lastEmailFor } from "@/services/email.service.js";
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
const tokenFromInvite = (email: string) => lastEmailFor(email)!.text.match(/token=([^\s&]+)/)![1];

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
  await seed();
});

describe("M5 — team members", () => {
  it("requires auth and lists the owner with seats", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/members" })).statusCode).toBe(401);
    await onboard("Alpha Co", "a@alpha.test");
    const { token } = await login("a@alpha.test");
    const res = await app.inject({ method: "GET", url: "/v1/members", headers: auth(token!) });
    const body = res.json() as { members: Array<{ role: string; is_current_user: boolean }>; seat_cap: number; seat_used: number };
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({ role: "owner", is_current_user: true });
    expect(body).toMatchObject({ seat_cap: 2, seat_used: 1 });
  });

  it("invites a member, enforces the seat cap and blocks duplicates", async () => {
    await onboard("Beta Co", "b@beta.test");
    const { token } = await login("b@beta.test");
    const t = token!;

    const inv = await app.inject({ method: "POST", url: "/v1/members/invite", headers: auth(t), payload: { email: "dev@beta.test", role: "developer" } });
    expect(inv.statusCode).toBe(201);
    expect((inv.json() as { member: { status: string; role: string } }).member).toMatchObject({ status: "invited", role: "developer" });
    expect(lastEmailFor("dev@beta.test")?.subject).toMatch(/invited/i);

    const dup = await app.inject({ method: "POST", url: "/v1/members/invite", headers: auth(t), payload: { email: "dev@beta.test", role: "member" } });
    expect(dup.statusCode).toBe(409);

    // Seat cap is 2 (owner + 1) → a third seat is refused.
    const over = await app.inject({ method: "POST", url: "/v1/members/invite", headers: auth(t), payload: { email: "third@beta.test", role: "member" } });
    expect(over.statusCode).toBe(409);
  });

  it("accepts an invite → member becomes active and can log in; developer can't list team", async () => {
    await onboard("Gamma Co", "g@gamma.test");
    const { token } = await login("g@gamma.test");
    await app.inject({ method: "POST", url: "/v1/members/invite", headers: auth(token!), payload: { email: "dev@gamma.test", role: "developer" } });

    const invToken = tokenFromInvite("dev@gamma.test");
    const accepted = await app.inject({ method: "POST", url: "/v1/auth/accept-invite", payload: { token: invToken, name: "Dev Person", password: "Dev#Passw0rd1" } });
    expect(accepted.statusCode).toBe(200);

    // The invited user can now log in with their chosen password.
    const devLogin = await login("dev@gamma.test", "Dev#Passw0rd1");
    expect(devLogin.status).toBe(200);

    // Roster shows them active with their real name.
    const list = await app.inject({ method: "GET", url: "/v1/members", headers: auth(token!) });
    const dev = (list.json() as { members: Array<{ email: string; status: string; name: string }> }).members.find((m) => m.email === "dev@gamma.test");
    expect(dev).toMatchObject({ status: "active", name: "Dev Person" });

    // A developer lacks member:read → cannot list the team.
    const devList = await app.inject({ method: "GET", url: "/v1/members", headers: auth(devLogin.token!) });
    expect(devList.statusCode).toBe(403);

    // A used invite token can't be replayed.
    const replay = await app.inject({ method: "POST", url: "/v1/auth/accept-invite", payload: { token: invToken, name: "Someone", password: "Another#Pw12" } });
    expect(replay.statusCode).toBe(400);
  });

  it("changes a member's role and guards self-actions", async () => {
    await onboard("Delta Co", "d@delta.test");
    const { token } = await login("d@delta.test");
    const t = token!;
    await app.inject({ method: "POST", url: "/v1/members/invite", headers: auth(t), payload: { email: "dev@delta.test", role: "developer" } });
    await app.inject({ method: "POST", url: "/v1/auth/accept-invite", payload: { token: tokenFromInvite("dev@delta.test"), name: "Dev", password: "Dev#Passw0rd1" } });

    const list = await app.inject({ method: "GET", url: "/v1/members", headers: auth(t) });
    const members = (list.json() as { members: Array<{ id: string; email: string; is_current_user: boolean }> }).members;
    const owner = members.find((m) => m.is_current_user)!;
    const dev = members.find((m) => m.email === "dev@delta.test")!;

    const changed = await app.inject({ method: "PATCH", url: `/v1/members/${dev.id}/role`, headers: auth(t), payload: { role: "member" } });
    expect(changed.statusCode).toBe(200);
    expect((changed.json() as { member: { role: string } }).member.role).toBe("member");

    // Owner can't change their own role.
    const self = await app.inject({ method: "PATCH", url: `/v1/members/${owner.id}/role`, headers: auth(t), payload: { role: "member" } });
    expect(self.statusCode).toBe(400);
  });

  it("removes a member (freeing the email) and guards self/last-owner", async () => {
    await onboard("Epsilon Co", "e@eps.test");
    const { token } = await login("e@eps.test");
    const t = token!;
    await app.inject({ method: "POST", url: "/v1/members/invite", headers: auth(t), payload: { email: "dev@eps.test", role: "developer" } });
    const list = await app.inject({ method: "GET", url: "/v1/members", headers: auth(t) });
    const members = (list.json() as { members: Array<{ id: string; email: string; is_current_user: boolean }> }).members;
    const owner = members.find((m) => m.is_current_user)!;
    const dev = members.find((m) => m.email === "dev@eps.test")!;

    // Owner can't remove themselves (also the last owner).
    expect((await app.inject({ method: "DELETE", url: `/v1/members/${owner.id}`, headers: auth(t) })).statusCode).toBe(400);

    // Remove the invited member.
    expect((await app.inject({ method: "DELETE", url: `/v1/members/${dev.id}`, headers: auth(t) })).statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url: "/v1/members", headers: auth(t) });
    expect((after.json() as { members: unknown[] }).members).toHaveLength(1);

    // The freed email can be re-invited.
    expect((await app.inject({ method: "POST", url: "/v1/members/invite", headers: auth(t), payload: { email: "dev@eps.test", role: "member" } })).statusCode).toBe(201);
  });

  it("an invited member can't log in until they accept — even via the reset-password back door", async () => {
    await onboard("Zeta Co", "z@zeta.test");
    const { token } = await login("z@zeta.test");
    await app.inject({ method: "POST", url: "/v1/members/invite", headers: auth(token!), payload: { email: "pending@zeta.test", role: "developer" } });

    // Attacker who controls the invited mailbox tries to set a password via reset, skipping acceptance.
    await app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "pending@zeta.test" } });
    const resetToken = lastEmailFor("pending@zeta.test")!.text.match(/token=([^\s&]+)/)![1];
    const reset = await app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token: resetToken, new_password: "Sneaky#Passw0rd1" } });
    expect(reset.statusCode).toBe(200);

    // Still can't log in — status is 'invited', not 'active'.
    const blocked = await login("pending@zeta.test", "Sneaky#Passw0rd1");
    expect(blocked.status).toBe(403);
  });

  it("keeps team management isolated between tenants", async () => {
    await onboard("Iso A", "a@iso.test");
    await onboard("Iso B", "b@iso.test");
    const { token: ta } = await login("a@iso.test");
    const { token: tb } = await login("b@iso.test");
    await app.inject({ method: "POST", url: "/v1/members/invite", headers: auth(ta!), payload: { email: "dev@iso.test", role: "developer" } });
    const aList = await app.inject({ method: "GET", url: "/v1/members", headers: auth(ta!) });
    const devId = (aList.json() as { members: Array<{ id: string; email: string }> }).members.find((m) => m.email === "dev@iso.test")!.id;

    const bList = await app.inject({ method: "GET", url: "/v1/members", headers: auth(tb!) });
    expect((bList.json() as { members: unknown[] }).members).toHaveLength(1); // only B's owner
    expect((await app.inject({ method: "PATCH", url: `/v1/members/${devId}/role`, headers: auth(tb!), payload: { role: "member" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/v1/members/${devId}`, headers: auth(tb!) })).statusCode).toBe(404);
  });
});
