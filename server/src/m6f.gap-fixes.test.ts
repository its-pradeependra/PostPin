import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hashPassword } from "@/lib/crypto.js";
import { env } from "@/config/env.js";
import {
  ApiLogModel,
  AuditLogModel,
  NotificationModel,
  PermissionModel,
  PlanModel,
  RoleModel,
  SettingsModel,
  SubscriptionModel,
  UserModel,
  WebhookDeliveryModel,
  ZoneModel,
} from "@/models/index.js";
import { SEED_ZONES } from "@/data/zones.data.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { PLATFORM_ROLES } from "@/shared/roles.js";
import { sweepSubscriptions } from "@/services/subscription-lifecycle.service.js";
import { invalidateEngineDefaults } from "@/services/rate-engine.service.js";
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

/** Poll until `check` returns truthy (fire-and-forget side effects). */
async function eventually<T>(check: () => Promise<T | null | undefined | false>, ms = 3000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v as T;
    if (Date.now() > until) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 40));
  }
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
  await seed();
  invalidateEngineDefaults();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────
describe("M6f — outbound webhooks fire on real events", () => {
  it("key.created delivers a signed payload to a subscribed endpoint (and records it)", async () => {
    await onboardCompany({ companyName: "Hook Co", ownerName: "O", ownerEmail: "h@hook.test", password: PW, emailVerified: true });
    const t = (await login("h@hook.test"))!;

    const created = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: auth(t),
      payload: { url: "https://hooks.example.test/postpin", events: ["key.created"] },
    });
    expect(created.statusCode).toBe(201);

    // Capture outbound deliveries instead of hitting the network.
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
        calls.push({ url, headers: init.headers, body: init.body });
        return { ok: true, status: 200, text: async () => "ok" };
      }),
    );

    const keyRes = await app.inject({ method: "POST", url: "/v1/keys", headers: auth(t), payload: { name: "Hooked Key", mode: "test" } });
    expect(keyRes.statusCode).toBe(201);

    const delivery = await eventually(() =>
      WebhookDeliveryModel.findOne({ event: "key.created", ok: true }).lean(),
    );
    expect(delivery).toBeTruthy();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://hooks.example.test/postpin");
    expect(call.headers["x-postpin-event"]).toBe("key.created");
    expect(call.headers["x-postpin-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    const payload = JSON.parse(call.body) as { event: string; data: { name: string; prefix: string } };
    expect(payload.event).toBe("key.created");
    expect(payload.data.name).toBe("Hooked Key");
    // The raw secret must NEVER ride along in a webhook.
    expect(call.body).not.toMatch(/pp_test_[a-zA-Z0-9]{20}/);
  });

  it("retries a failing endpoint up to 3 attempts and tracks success-rate", async () => {
    await onboardCompany({ companyName: "Retry Co", ownerName: "O", ownerEmail: "r@retry.test", password: PW, emailVerified: true });
    const t = (await login("r@retry.test"))!;
    await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: auth(t),
      payload: { url: "https://hooks.example.test/retry", events: ["key.revoked"] },
    });

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, text: async () => "down" })));

    const keyRes = await app.inject({ method: "POST", url: "/v1/keys", headers: auth(t), payload: { name: "Doomed Key", mode: "test" } });
    const keyId = (keyRes.json() as { key: { id: string } }).key.id;
    await app.inject({ method: "POST", url: `/v1/keys/${keyId}/revoke`, headers: auth(t) });

    await eventually(async () => (await WebhookDeliveryModel.countDocuments({ event: "key.revoked" })) >= 3);
    const attempts = await WebhookDeliveryModel.find({ event: "key.revoked" }).sort({ attempt: 1 }).lean();
    expect(attempts.map((a) => a.attempt)).toEqual([1, 2, 3]);
    expect(attempts.every((a) => a.ok === false)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("M6f — subscription lifecycle sweeper", () => {
  const past = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000);

  it("downgrades a canceled paid plan to Free at period end (audit + notification)", async () => {
    const { companyId } = await onboardCompany({ companyName: "Cancel Co", ownerName: "O", ownerEmail: "c@cancel.test", password: PW, emailVerified: true });
    await SubscriptionModel.updateOne(
      { companyId, status: "active" },
      { $set: { planCode: "growth", priceSnapshotPaise: 99900, cancelAtPeriodEnd: true, currentPeriodEnd: past(1) } },
    );

    const res = await sweepSubscriptions();
    expect(res.downgraded).toBe(1);

    const sub = await SubscriptionModel.findOne({ companyId, status: "active" }).lean();
    expect(sub!.planCode).toBe("free");
    expect(sub!.cancelAtPeriodEnd).toBe(false);
    expect(new Date(sub!.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());

    expect(await AuditLogModel.findOne({ action: "billing.downgraded_on_cancel" }).lean()).toBeTruthy();
    expect(await NotificationModel.findOne({ type: "subscription.downgraded", companyId }).lean()).toBeTruthy();
  });

  it("sends ONE renewal notice inside the grace window, then downgrades after it", async () => {
    const { companyId } = await onboardCompany({ companyName: "Grace Co", ownerName: "O", ownerEmail: "g@grace.test", password: PW, emailVerified: true });
    await SubscriptionModel.updateOne(
      { companyId, status: "active" },
      { $set: { planCode: "growth", priceSnapshotPaise: 99900, cancelAtPeriodEnd: false, currentPeriodEnd: past(2) } },
    );

    clearEmails();
    const first = await sweepSubscriptions();
    expect(first.renewal_notices).toBe(1);
    expect(first.downgraded).toBe(0);
    expect(recentEmails().length).toBeGreaterThanOrEqual(1);

    // Second sweep inside the same period: no duplicate notice.
    const second = await sweepSubscriptions();
    expect(second.renewal_notices).toBe(0);

    // Push past the 7-day grace → downgrade to Free.
    await SubscriptionModel.updateOne({ companyId, status: "active" }, { $set: { currentPeriodEnd: past(8) } });
    const third = await sweepSubscriptions();
    expect(third.downgraded).toBe(1);
    const sub = await SubscriptionModel.findOne({ companyId, status: "active" }).lean();
    expect(sub!.planCode).toBe("free");
    expect(await AuditLogModel.findOne({ action: "billing.downgraded_on_expiry" }).lean()).toBeTruthy();
  });

  it("rolls a free plan's period forward silently", async () => {
    const { companyId } = await onboardCompany({ companyName: "Free Co", ownerName: "O", ownerEmail: "f@free.test", password: PW, emailVerified: true });
    await SubscriptionModel.updateOne({ companyId, status: "active" }, { $set: { currentPeriodEnd: past(1) } });

    const res = await sweepSubscriptions();
    expect(res.rolled).toBe(1);
    const sub = await SubscriptionModel.findOne({ companyId, status: "active" }).lean();
    expect(sub!.planCode).toBe("free");
    expect(new Date(sub!.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());
    expect(sub!.usage?.periodKey).toBe(new Date().toISOString().slice(0, 7));
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("M6f — engine.defaults edits reprice live quotes", () => {
  it("PATCH /admin/settings/engine.defaults changes GST on the next public quote", async () => {
    await SettingsModel.create({
      scope: "platform",
      companyId: null,
      key: "engine.defaults",
      value: { gstBps: 1800, fuelBps: 1200, codFlatPaise: 3500, codPercentBps: 150, volumetricDivisor: 5000 },
      editableBy: "super_admin",
    });
    invalidateEngineDefaults();

    const quote = () =>
      app.inject({
        method: "POST",
        url: "/v1/public/rates/calculate",
        payload: { origin: "302001", destination: "302015", weight: 1000, service: "surface" },
      });

    const before = ((await quote()).json() as { data: { total: number; breakdown: Array<{ label: string; hint?: string }> } }).data;
    expect(before.breakdown.find((l) => l.label === "GST")?.hint).toBe("18%");

    const t = (await login(ADMIN))!;
    const patched = await app.inject({
      method: "PATCH",
      url: "/v1/admin/settings/engine.defaults",
      headers: auth(t),
      payload: { gstBps: 900 },
    });
    expect(patched.statusCode).toBe(200);

    const after = ((await quote()).json() as { data: { total: number; breakdown: Array<{ label: string; hint?: string }> } }).data;
    expect(after.breakdown.find((l) => l.label === "GST")?.hint).toBe("9%");
    expect(after.total).toBeLessThan(before.total);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("M6f — public contact endpoint", () => {
  it("delivers the enquiry to the ops inbox and writes an audit row", async () => {
    clearEmails();
    const res = await app.inject({
      method: "POST",
      url: "/v1/public/contact",
      payload: { name: "Priya Verma", email: "priya@shop.example", company: "Shop Co", topic: "Talk to sales", message: "We ship 20k parcels a month and want API pricing." },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { received: boolean } }).data.received).toBe(true);

    const mail = recentEmails().find((m) => m.to === env.SEED_ADMIN_EMAIL);
    expect(mail).toBeTruthy();
    expect(mail!.subject).toContain("Talk to sales");
    expect(mail!.text).toContain("priya@shop.example");

    expect(await AuditLogModel.findOne({ action: "contact.submitted" }).lean()).toBeTruthy();
  });

  it("rejects a too-short message (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/public/contact",
      payload: { name: "X Y", email: "x@y.example", message: "hi" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("M6f — honest admin usage + webhook cap", () => {
  it("admin tenant detail counts real apiLogs calls, not the dead usage field", async () => {
    const { companyId } = await onboardCompany({ companyName: "Usage Co", ownerName: "O", ownerEmail: "u@usage.test", password: PW, emailVerified: true });
    const tenantT = (await login("u@usage.test"))!;
    const keyRes = await app.inject({ method: "POST", url: "/v1/keys", headers: auth(tenantT), payload: { name: "Usage Key", mode: "test" } });
    const secret = (keyRes.json() as { secret: string }).secret;

    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/v1/rates/calculate",
        headers: { authorization: `Bearer ${secret}` },
        payload: { origin: "302001", destination: "302015", weight: 500, service: "surface" },
      });
      expect(r.statusCode).toBe(200);
    }
    // apiLogs writes are fire-and-forget — wait for all three.
    await eventually(async () => (await ApiLogModel.countDocuments({ companyId, billable: true })) >= 3);

    const adminT = (await login(ADMIN))!;
    const detail = await app.inject({ method: "GET", url: `/v1/admin/tenants/${companyId}`, headers: auth(adminT) });
    const sub = (detail.json() as { subscription: { calls_used: number; quota_pct: number } }).subscription;
    expect(sub.calls_used).toBe(3);
    expect(sub.quota_pct).toBeGreaterThan(0);

    // The per-key counters on the Keys page must also move (requestCount +
    // lastUsedAt) — these drive "REQUESTS" and "LAST USED". Fire-and-forget, so poll.
    const key = await eventually(async () => {
      const keys = await app.inject({ method: "GET", url: "/v1/keys", headers: auth(tenantT) });
      const k = (keys.json() as { keys: Array<{ request_count: number; last_used_at: string | null }> }).keys[0]!;
      return k.request_count === 3 ? k : null;
    });
    expect(key.request_count).toBe(3);
    expect(key.last_used_at).not.toBeNull();
  });

  it("a tenant can NOT edit or delete the platform-assigned billing card (403)", async () => {
    const adminT = (await login(ADMIN))!;
    const { companyId } = await onboardCompany({ companyName: "Locked Co", ownerName: "O", ownerEmail: "l@locked.test", password: PW, emailVerified: true });
    const tenantT = (await login("l@locked.test"))!;

    // Admin creates + assigns a negotiated card → it becomes the billing card.
    const created = await app.inject({
      method: "POST",
      url: "/v1/admin/rate-cards",
      headers: auth(adminT),
      payload: { company_id: String(companyId), name: "Negotiated", rows: [{ zone_code: "within_city", base_charge: 100, per_500g: 10 }] },
    });
    const cardId = (created.json() as { card: { id: string } }).card.id;
    await app.inject({ method: "POST", url: `/v1/admin/rate-cards/${cardId}/assign`, headers: auth(adminT) });

    // Tenant tries to rewrite their own prices → refused.
    const edit = await app.inject({
      method: "PATCH",
      url: `/v1/rate-cards/${cardId}`,
      headers: auth(tenantT),
      payload: { slabs: [{ zoneCode: "within_city", fromWeightG: 0, baseChargePaise: 1, stepChargePaise: 0 }] },
    });
    expect(edit.statusCode).toBe(403);
    expect((edit.json() as { error: { code: string } }).error.code).toBe("card_platform_managed");

    const del = await app.inject({ method: "DELETE", url: `/v1/rate-cards/${cardId}`, headers: auth(tenantT) });
    expect(del.statusCode).toBe(403);

    // A tenant's own DRAFT card stays freely editable.
    const draft = await app.inject({ method: "POST", url: "/v1/rate-cards", headers: auth(tenantT), payload: { name: "My Draft" } });
    const draftId = (draft.json() as { card: { id: string } }).card.id;
    const draftEdit = await app.inject({ method: "PATCH", url: `/v1/rate-cards/${draftId}`, headers: auth(tenantT), payload: { name: "My Draft v2" } });
    expect(draftEdit.statusCode).toBe(200);
  });

  it("GET /v1/webhooks returns the server-enforced endpoint cap", async () => {
    await onboardCompany({ companyName: "Cap Co", ownerName: "O", ownerEmail: "cap@cap.test", password: PW, emailVerified: true });
    const t = (await login("cap@cap.test"))!;
    const res = await app.inject({ method: "GET", url: "/v1/webhooks", headers: auth(t) });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { cap: number }).cap).toBe(10);
  });
});
