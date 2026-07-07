import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hashPassword } from "@/lib/crypto.js";
import { CompanyModel, PermissionModel, PlanModel, RoleModel, UserModel } from "@/models/index.js";
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
    await RoleModel.create({
      companyId: null,
      key: r.key,
      name: r.name,
      scope: "platform",
      isSystem: true,
      permissionIds: r.permissions.map((k) => permIdByKey.get(k)).filter(Boolean),
    });
  }
  const superRole = await RoleModel.findOne({ companyId: null, key: "super_admin" });
  await UserModel.create({
    companyId: null,
    email: ADMIN,
    name: "Root Admin",
    passwordHash: await hashPassword(PW),
    roleId: superRole!._id,
    isPlatformStaff: true,
    status: "active",
    emailVerifiedAt: new Date(),
  });
  const common = { version: 1, rateLimit: { rpm: 30, rpd: 0, burst: 10 }, isActive: true, isPublic: true };
  await PlanModel.create({ code: "free", name: "Free", description: "Free", priceMonthlyPaise: 0, priceYearlyPaise: 0, includedCalls: 1000, maxApiKeys: 10, maxTeamMembers: 2, sortOrder: 0, ...common });
  await PlanModel.create({ code: "growth", name: "Growth", description: "Scale", priceMonthlyPaise: 499_900, priceYearlyPaise: 416_500, includedCalls: 250_000, maxApiKeys: 10, maxTeamMembers: 10, sortOrder: 2, ...common });
}

async function login(email: string, password = PW) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  return { status: res.statusCode, token: (res.json() as { access_token?: string }).access_token, body: res.json() as Record<string, unknown> };
}
async function onboard(name: string, email: string) {
  const r = await onboardCompany({ companyName: name, ownerName: "Owner", ownerEmail: email, password: PW, emailVerified: true });
  const { token } = await login(email);
  return { token: token!, companyId: r.companyId };
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

describe("M6 — platform authz", () => {
  it("blocks anonymous and tenant users from every admin surface", async () => {
    const { token: tenantToken } = await onboard("Blocked Co", "b@blocked.test");
    for (const url of ["/v1/admin/overview", "/v1/admin/tenants", "/v1/admin/tickets", "/v1/admin/audit-logs", "/v1/admin/usage-report"]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
      expect((await app.inject({ method: "GET", url, headers: auth(tenantToken) })).statusCode).toBe(403);
    }
  });
});

describe("M6 — overview + usage report", () => {
  it("computes real platform metrics (MRR from a paid checkout, tenants, calls)", async () => {
    const admin = await login(ADMIN);
    const { token } = await onboard("Metrics Co", "m@metrics.test");

    // Give the platform real revenue: tenant upgrades to Growth via the real flow.
    const co = await app.inject({ method: "POST", url: "/v1/billing/checkout", headers: auth(token), payload: { plan_code: "growth", interval: "monthly" } });
    const orderId = (co.json() as { order_id: string }).order_id;
    await app.inject({ method: "POST", url: "/v1/billing/dev-complete", headers: auth(token), payload: { order_id: orderId } });

    const res = await app.inject({ method: "GET", url: "/v1/admin/overview", headers: auth(admin.token!) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      metrics: Array<{ key: string; value: number }>;
      revenue_series: Array<{ month: string; mrr: number }>;
      sync: { total: number };
      alerts: unknown[];
      activity: Array<{ action: string }>;
    };
    const metric = (k: string) => body.metrics.find((m) => m.key === k)!.value;
    expect(metric("mrr")).toBe(4999); // Growth priceSnapshot ₹4,999
    expect(metric("tenants")).toBe(1);
    expect(metric("signups")).toBe(1);
    expect(body.revenue_series).toHaveLength(12);
    expect(body.revenue_series[11]!.mrr).toBe(5898.82); // this month's collected revenue (incl GST)
    expect(body.activity.length).toBeGreaterThan(0);
  });

  it("aggregates platform usage from real keyed API calls", async () => {
    const admin = await login(ADMIN);
    const { token } = await onboard("Usage Co", "u@usage.test");
    const created = await app.inject({ method: "POST", url: "/v1/keys", headers: auth(token), payload: { name: "Usage Key", mode: "test" } });
    const secret = (created.json() as { secret: string }).secret;
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: "POST", url: "/v1/rates/calculate", headers: { authorization: `Bearer ${secret}` }, payload: { origin: "110001", destination: "560001", weight: 500, service: "surface" } });
    }
    // apiLog writes are async fire-and-forget — poll.
    let report: { summary: { calls: number }; top_consumers: Array<{ company_name: string; calls: number }> } | null = null;
    for (let i = 0; i < 40; i++) {
      const res = await app.inject({ method: "GET", url: "/v1/admin/usage-report?days=7", headers: auth(admin.token!) });
      report = res.json() as typeof report;
      if (report!.summary.calls >= 3) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(report!.summary.calls).toBe(3);
    expect(report!.top_consumers[0]).toMatchObject({ company_name: "Usage Co", calls: 3 });
  });
});

describe("M6 — tenant directory + suspension", () => {
  it("lists tenants with owner/plan and filters by q + status", async () => {
    const admin = await login(ADMIN);
    await onboard("Alpha Traders", "owner@alpha.test");
    await onboard("Beta Retail", "owner@beta.test");

    const all = await app.inject({ method: "GET", url: "/v1/admin/tenants", headers: auth(admin.token!) });
    const list = all.json() as { total: number; tenants: Array<{ name: string; owner_email: string; plan: string }> };
    expect(list.total).toBe(2);
    expect(list.tenants.map((t) => t.plan)).toEqual(["free", "free"]);

    const q = await app.inject({ method: "GET", url: "/v1/admin/tenants?q=alpha", headers: auth(admin.token!) });
    expect((q.json() as { total: number }).total).toBe(1);
    const byEmail = await app.inject({ method: "GET", url: "/v1/admin/tenants?q=owner@beta.test", headers: auth(admin.token!) });
    expect((byEmail.json() as { tenants: Array<{ name: string }> }).tenants[0]!.name).toBe("Beta Retail");
  });

  it("returns a full tenant detail (cross-tenant reads audited via adminRepo)", async () => {
    const admin = await login(ADMIN);
    const { token, companyId } = await onboard("Detail Co", "d@detail.test");
    await app.inject({ method: "POST", url: "/v1/keys", headers: auth(token), payload: { name: "Live Key", mode: "test" } });

    const res = await app.inject({ method: "GET", url: `/v1/admin/tenants/${companyId}`, headers: auth(admin.token!) });
    expect(res.statusCode).toBe(200);
    const d = res.json() as { company: { name: string }; owner: { email: string }; subscription: { plan: string }; keys: unknown[] };
    expect(d.company.name).toBe("Detail Co");
    expect(d.owner.email).toBe("d@detail.test");
    expect(d.subscription.plan).toBe("free");
    expect(d.keys).toHaveLength(1);
  });

  it("suspend blocks login AND kills live tokens; activate restores access", async () => {
    const admin = await login(ADMIN);
    const { token, companyId } = await onboard("Suspend Co", "s@suspend.test");

    // Tenant works before suspension.
    expect((await app.inject({ method: "GET", url: "/v1/keys", headers: auth(token) })).statusCode).toBe(200);

    const sus = await app.inject({ method: "POST", url: `/v1/admin/tenants/${companyId}/suspend`, headers: auth(admin.token!) });
    expect(sus.statusCode).toBe(200);

    // Live access token dies (permVersion bump → token_stale 401).
    expect((await app.inject({ method: "GET", url: "/v1/keys", headers: auth(token) })).statusCode).toBe(401);
    // Fresh login is refused at the door.
    const blocked = await login("s@suspend.test");
    expect(blocked.status).toBe(403);

    // Restore.
    await app.inject({ method: "POST", url: `/v1/admin/tenants/${companyId}/activate`, headers: auth(admin.token!) });
    expect((await login("s@suspend.test")).status).toBe(200);
  });
});

describe("M6 — admin support queue", () => {
  async function tenantWithTicket() {
    const t = await onboard("Ticket Co", "t@ticket.test");
    const created = await app.inject({ method: "POST", url: "/v1/tickets", headers: auth(t.token), payload: { subject: "API returns 500 on bulk", category: "api", priority: "urgent", body: "Bulk endpoint fails for large payloads." } });
    return { ...t, number: (created.json() as { ticket: { id: string } }).ticket.id };
  }

  it("queues cross-tenant tickets with SLA and filters", async () => {
    const admin = await login(ADMIN);
    const { number } = await tenantWithTicket();
    const res = await app.inject({ method: "GET", url: "/v1/admin/tickets", headers: auth(admin.token!) });
    const list = (res.json() as { tickets: Array<{ id: string; requester: { company: string }; sla: { label: string } }> }).tickets;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: number, requester: { company: "Ticket Co" } });
    expect(list[0]!.sla.label).toBe("On track"); // urgent → 4h SLA, just created

    const none = await app.inject({ method: "GET", url: "/v1/admin/tickets?status=resolved", headers: auth(admin.token!) });
    expect((none.json() as { tickets: unknown[] }).tickets).toHaveLength(0);
  });

  it("agent reply notifies the tenant; internal notes stay hidden from them", async () => {
    const admin = await login(ADMIN);
    const { token, number } = await tenantWithTicket();

    // Public agent reply.
    const pub = await app.inject({ method: "POST", url: `/v1/admin/tickets/${number}/replies`, headers: auth(admin.token!), payload: { body: "We are on it — rolling out a fix.", is_internal: false } });
    expect(pub.statusCode).toBe(201);
    // Internal note.
    await app.inject({ method: "POST", url: `/v1/admin/tickets/${number}/replies`, headers: auth(admin.token!), payload: { body: "Suspect the payload-size limit.", is_internal: true } });

    // Admin sees BOTH; tenant sees only the public reply.
    const adminView = await app.inject({ method: "GET", url: `/v1/admin/tickets/${number}`, headers: auth(admin.token!) });
    const adminMsgs = (adminView.json() as { ticket: { messages: Array<{ body: string; internal: boolean }> } }).ticket.messages;
    expect(adminMsgs.filter((m) => m.internal)).toHaveLength(1);

    const tenantView = await app.inject({ method: "GET", url: `/v1/tickets/${number}`, headers: auth(token) });
    const tenantMsgs = (tenantView.json() as { ticket: { messages: Array<{ body: string }> } }).ticket.messages;
    expect(tenantMsgs.some((m) => m.body.includes("rolling out a fix"))).toBe(true);
    expect(tenantMsgs.some((m) => m.body.includes("payload-size limit"))).toBe(false);

    // Tenant got a notification about the agent reply.
    const notifs = await app.inject({ method: "GET", url: "/v1/notifications", headers: auth(token) });
    expect((notifs.json() as { data: Array<{ kind: string }> }).data.some((n) => n.kind === "ticket")).toBe(true);
  });

  it("resolves a ticket (status change visible to the tenant, agent assignable)", async () => {
    const admin = await login(ADMIN);
    const { token, number } = await tenantWithTicket();
    const staff = await app.inject({ method: "GET", url: "/v1/admin/staff", headers: auth(admin.token!) });
    const staffId = (staff.json() as { staff: Array<{ id: string }> }).staff[0]!.id;

    const upd = await app.inject({ method: "PATCH", url: `/v1/admin/tickets/${number}`, headers: auth(admin.token!), payload: { status: "resolved", assignee_id: staffId } });
    expect(upd.statusCode).toBe(200);
    expect((upd.json() as { ticket: { status: string; assignee: { name: string } } }).ticket).toMatchObject({ status: "resolved", assignee: { name: "Root Admin" } });

    const tenantView = await app.inject({ method: "GET", url: `/v1/tickets/${number}`, headers: auth(token) });
    expect((tenantView.json() as { ticket: { status: string } }).ticket.status).toBe("resolved");
  });
});

describe("M6 — audit logs", () => {
  it("lists real audit rows with filters", async () => {
    const admin = await login(ADMIN);
    await onboard("Audit Co", "a@audit.test"); // generates company.signup / auth events
    const res = await app.inject({ method: "GET", url: "/v1/admin/audit-logs?limit=20", headers: auth(admin.token!) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { total: number; logs: Array<{ action: string; category: string }> };
    expect(body.total).toBeGreaterThan(0);
    const authOnly = await app.inject({ method: "GET", url: "/v1/admin/audit-logs?category=auth", headers: auth(admin.token!) });
    expect((authOnly.json() as { logs: Array<{ category: string }> }).logs.every((l) => l.category === "auth")).toBe(true);
  });
});
