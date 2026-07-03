import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { PermissionModel, PlanModel, TicketModel } from "@/models/index.js";
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

async function onboard(name: string, email: string, ownerName = "Owner") {
  await onboardCompany({ companyName: name, ownerName, ownerEmail: email, password: PW, emailVerified: true });
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PW } });
  return (res.json() as { access_token: string }).access_token;
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

describe("M5 — support tickets", () => {
  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/tickets" });
    expect(res.statusCode).toBe(401);
  });

  it("validates create input", async () => {
    const t = await onboard("Val Co", "v@val.test");
    const short = await app.inject({ method: "POST", url: "/v1/tickets", headers: auth(t), payload: { subject: "hi", category: "api", priority: "high", body: "long enough body here" } });
    expect(short.statusCode).toBe(400);
    const noBody = await app.inject({ method: "POST", url: "/v1/tickets", headers: auth(t), payload: { subject: "Valid subject", category: "api", priority: "high", body: "short" } });
    expect(noBody.statusCode).toBe(400);
  });

  it("creates → lists → reads a thread → replies", async () => {
    const t = await onboard("Alpha Co", "a@alpha.test", "Aarav Sharma");

    const created = await app.inject({
      method: "POST",
      url: "/v1/tickets",
      headers: auth(t),
      payload: { subject: "Rate mismatch for 190001", category: "pincode-data", priority: "high", body: "The rate for Srinagar looks off by a lot." },
    });
    expect(created.statusCode).toBe(201);
    const ticket = (created.json() as { ticket: { id: string; status: string; requester: { name: string } } }).ticket;
    expect(ticket.id).toMatch(/^PP-\d{4}-\d{6}$/);
    expect(ticket.status).toBe("open");
    expect(ticket.requester.name).toBe("Aarav Sharma");

    const list = await app.inject({ method: "GET", url: "/v1/tickets", headers: auth(t) });
    expect((list.json() as { tickets: unknown[] }).tickets).toHaveLength(1);

    const detail = await app.inject({ method: "GET", url: `/v1/tickets/${ticket.id}`, headers: auth(t) });
    const dt = detail.json() as { ticket: { messages: Array<{ author: string; authorRole: string; body: string }> } };
    expect(dt.ticket.messages).toHaveLength(1); // root message = the ticket body
    expect(dt.ticket.messages[0]!.authorRole).toBe("customer");
    expect(dt.ticket.messages[0]!.body).toContain("Srinagar");

    const reply = await app.inject({ method: "POST", url: `/v1/tickets/${ticket.id}/replies`, headers: auth(t), payload: { body: "Any update on this?" } });
    expect(reply.statusCode).toBe(201);
    expect((reply.json() as { message: { authorRole: string } }).message.authorRole).toBe("customer");
    expect((reply.json() as { reopened: boolean }).reopened).toBe(false);

    const detail2 = await app.inject({ method: "GET", url: `/v1/tickets/${ticket.id}`, headers: auth(t) });
    expect((detail2.json() as { ticket: { messages: unknown[] } }).ticket.messages).toHaveLength(2);
  });

  it("reopens a resolved ticket when the requester replies", async () => {
    const t = await onboard("Reopen Co", "r@reopen.test");
    const created = await app.inject({ method: "POST", url: "/v1/tickets", headers: auth(t), payload: { subject: "Please help me", category: "api", priority: "low", body: "This is my detailed problem." } });
    const num = (created.json() as { ticket: { id: string } }).ticket.id;
    await TicketModel.updateOne({ ticketNumber: num }, { $set: { status: "resolved" } });

    const reply = await app.inject({ method: "POST", url: `/v1/tickets/${num}/replies`, headers: auth(t), payload: { body: "Actually it is still broken." } });
    expect((reply.json() as { reopened: boolean }).reopened).toBe(true);
    const detail = await app.inject({ method: "GET", url: `/v1/tickets/${num}`, headers: auth(t) });
    expect((detail.json() as { ticket: { status: string } }).ticket.status).toBe("open");
  });

  it("filters by status", async () => {
    const t = await onboard("Filter Co", "f@filter.test");
    for (const s of ["Alpha subject one", "Beta subject two"]) {
      await app.inject({ method: "POST", url: "/v1/tickets", headers: auth(t), payload: { subject: s, category: "other", priority: "low", body: "Body long enough here." } });
    }
    const all = await app.inject({ method: "GET", url: "/v1/tickets", headers: auth(t) });
    const first = (all.json() as { tickets: { id: string }[] }).tickets[0]!.id;
    await TicketModel.updateOne({ ticketNumber: first }, { $set: { status: "resolved" } });

    const open = await app.inject({ method: "GET", url: "/v1/tickets?status=open", headers: auth(t) });
    expect((open.json() as { tickets: unknown[] }).tickets).toHaveLength(1);
    const resolved = await app.inject({ method: "GET", url: "/v1/tickets?status=resolved", headers: auth(t) });
    expect((resolved.json() as { tickets: unknown[] }).tickets).toHaveLength(1);
  });

  it("isolates tickets between tenants (404-before-403)", async () => {
    const ta = await onboard("Iso A", "a@iso.test");
    const tb = await onboard("Iso B", "b@iso.test");
    const created = await app.inject({ method: "POST", url: "/v1/tickets", headers: auth(ta), payload: { subject: "A private ticket", category: "api", priority: "high", body: "Confidential to tenant A." } });
    const num = (created.json() as { ticket: { id: string } }).ticket.id;

    const bList = await app.inject({ method: "GET", url: "/v1/tickets", headers: auth(tb) });
    expect((bList.json() as { tickets: unknown[] }).tickets).toHaveLength(0);
    const bGet = await app.inject({ method: "GET", url: `/v1/tickets/${num}`, headers: auth(tb) });
    expect(bGet.statusCode).toBe(404);
    const bReply = await app.inject({ method: "POST", url: `/v1/tickets/${num}/replies`, headers: auth(tb), payload: { body: "Trying to snoop here." } });
    expect(bReply.statusCode).toBe(404);
  });
});
