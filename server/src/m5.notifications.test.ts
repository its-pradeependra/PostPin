import { Types } from "mongoose";
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

describe("M5 — notifications", () => {
  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/notifications" });
    expect(res.statusCode).toBe(401);
  });

  it("emits notifications from real events, lists them, and marks them read", async () => {
    const t = await onboard("Alpha Co", "a@alpha.test");

    // Creating a key emits a 'key' notification…
    const key = await app.inject({ method: "POST", url: "/v1/keys", headers: auth(t), payload: { name: "Prod Key", mode: "test" } });
    expect(key.statusCode).toBe(201);
    // …and opening a ticket emits a 'ticket' notification.
    await app.inject({ method: "POST", url: "/v1/tickets", headers: auth(t), payload: { subject: "Need help now", category: "api", priority: "high", body: "Something is not working." } });

    const list = await app.inject({ method: "GET", url: "/v1/notifications", headers: auth(t) });
    const page = list.json() as { data: Array<{ id: string; kind: string; read: boolean }>; unreadCount: number; total: number };
    expect(page.total).toBe(2);
    expect(page.unreadCount).toBe(2);
    const kinds = page.data.map((n) => n.kind).sort();
    expect(kinds).toEqual(["key", "ticket"]);
    expect(page.data.every((n) => n.read === false)).toBe(true);

    // Mark one read.
    const first = page.data[0]!.id;
    const read = await app.inject({ method: "POST", url: `/v1/notifications/${first}/read`, headers: auth(t) });
    expect(read.statusCode).toBe(200);
    expect((read.json() as { notification: { read: boolean } }).notification.read).toBe(true);

    const count1 = await app.inject({ method: "GET", url: "/v1/notifications/unread-count", headers: auth(t) });
    expect((count1.json() as { unreadCount: number }).unreadCount).toBe(1);

    // Mark all read.
    const all = await app.inject({ method: "POST", url: "/v1/notifications/mark-all-read", headers: auth(t) });
    expect((all.json() as { markedCount: number }).markedCount).toBe(1);
    const count2 = await app.inject({ method: "GET", url: "/v1/notifications/unread-count", headers: auth(t) });
    expect((count2.json() as { unreadCount: number }).unreadCount).toBe(0);
  });

  it("filters unread-only", async () => {
    const t = await onboard("Filter Co", "f@filter.test");
    await app.inject({ method: "POST", url: "/v1/keys", headers: auth(t), payload: { name: "K1", mode: "test" } });
    await app.inject({ method: "POST", url: "/v1/keys", headers: auth(t), payload: { name: "K2", mode: "test" } });
    const list = await app.inject({ method: "GET", url: "/v1/notifications", headers: auth(t) });
    const firstId = (list.json() as { data: { id: string }[] }).data[0]!.id;
    await app.inject({ method: "POST", url: `/v1/notifications/${firstId}/read`, headers: auth(t) });

    const unread = await app.inject({ method: "GET", url: "/v1/notifications?unread_only=true", headers: auth(t) });
    expect((unread.json() as { data: unknown[] }).data).toHaveLength(1);
  });

  it("404s when marking a non-existent notification", async () => {
    const t = await onboard("NF Co", "nf@nf.test");
    const res = await app.inject({ method: "POST", url: `/v1/notifications/${new Types.ObjectId().toString()}/read`, headers: auth(t) });
    expect(res.statusCode).toBe(404);
  });

  it("keeps notifications private per user", async () => {
    const ta = await onboard("Iso A", "a@iso.test");
    const tb = await onboard("Iso B", "b@iso.test");
    await app.inject({ method: "POST", url: "/v1/keys", headers: auth(ta), payload: { name: "A key", mode: "test" } });

    const bList = await app.inject({ method: "GET", url: "/v1/notifications", headers: auth(tb) });
    expect((bList.json() as { data: unknown[]; unreadCount: number }).data).toHaveLength(0);
    expect((bList.json() as { unreadCount: number }).unreadCount).toBe(0);
  });
});
