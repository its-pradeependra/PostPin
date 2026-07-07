import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hashPassword } from "@/lib/crypto.js";
import { CouponModel, PermissionModel, PlanModel, RoleModel, SubscriptionModel, UserModel } from "@/models/index.js";
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
    await RoleModel.create({ companyId: null, key: r.key, name: r.name, scope: "platform", isSystem: true, permissionIds: r.permissions.map((k) => permIdByKey.get(k)).filter(Boolean) });
  }
  const superRole = await RoleModel.findOne({ companyId: null, key: "super_admin" });
  await UserModel.create({ companyId: null, email: ADMIN, name: "Root Admin", passwordHash: await hashPassword(PW), roleId: superRole!._id, isPlatformStaff: true, status: "active", emailVerifiedAt: new Date() });
  const common = { version: 1, rateLimit: { rpm: 30, rpd: 0, burst: 10 }, isActive: true, isPublic: true };
  await PlanModel.create({ code: "free", name: "Free", description: "Free", priceMonthlyPaise: 0, priceYearlyPaise: 0, includedCalls: 1000, maxApiKeys: 10, maxTeamMembers: 2, sortOrder: 0, ...common });
  await PlanModel.create({ code: "growth", name: "Growth", description: "Scale", priceMonthlyPaise: 499_900, priceYearlyPaise: 416_500, includedCalls: 250_000, maxApiKeys: 10, maxTeamMembers: 10, sortOrder: 2, ...common });
}

async function login(email: string, password = PW) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  return (res.json() as { access_token?: string }).access_token;
}
async function onboard(name: string, email: string) {
  const r = await onboardCompany({ companyName: name, ownerName: "Owner", ownerEmail: email, password: PW, emailVerified: true });
  return { token: (await login(email))!, companyId: r.companyId };
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
async function upgrade(token: string, coupon?: string) {
  const co = await app.inject({ method: "POST", url: "/v1/billing/checkout", headers: auth(token), payload: { plan_code: "growth", interval: "monthly", ...(coupon ? { coupon_code: coupon } : {}) } });
  const orderId = (co.json() as { order_id: string }).order_id;
  await app.inject({ method: "POST", url: "/v1/billing/dev-complete", headers: auth(token), payload: { order_id: orderId } });
  return orderId;
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
});

describe("M6b — plans CRUD", () => {
  it("lists plans with live subscriber counts and blocks tenants", async () => {
    const adminT = (await login(ADMIN))!;
    const { token } = await onboard("Plans Co", "p@plans.test");
    await upgrade(token);

    expect((await app.inject({ method: "GET", url: "/v1/admin/plans", headers: auth(token) })).statusCode).toBe(403);

    const res = await app.inject({ method: "GET", url: "/v1/admin/plans", headers: auth(adminT) });
    const plans = (res.json() as { plans: Array<{ code: string; active_subscribers: number; price_monthly: number }> }).plans;
    expect(plans.find((p) => p.code === "growth")).toMatchObject({ active_subscribers: 1, price_monthly: 4999 });
    expect(plans.find((p) => p.code === "free")!.active_subscribers).toBe(0); // upgraded away
  });

  it("edits a plan price — new checkouts use it, existing snapshots don't move", async () => {
    const adminT = (await login(ADMIN))!;
    const a = await onboard("Old Price Co", "old@price.test");
    await upgrade(a.token);
    const before = await SubscriptionModel.findOne({ companyId: a.companyId, status: "active" }).lean();
    expect(before!.priceSnapshotPaise).toBe(499_900);

    const patched = await app.inject({ method: "PATCH", url: "/v1/admin/plans/growth", headers: auth(adminT), payload: { price_monthly: 5999 } });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { plan: { price_monthly: number } }).plan.price_monthly).toBe(5999);

    // Existing subscription unchanged (snapshot semantics).
    const after = await SubscriptionModel.findOne({ companyId: a.companyId, status: "active" }).lean();
    expect(after!.priceSnapshotPaise).toBe(499_900);

    // A NEW checkout pays the new price (+18% GST).
    const b = await onboard("New Price Co", "new@price.test");
    const co = await app.inject({ method: "POST", url: "/v1/billing/checkout", headers: auth(b.token), payload: { plan_code: "growth", interval: "monthly" } });
    expect((co.json() as { amount_paise: number }).amount_paise).toBe(599_900 + Math.round((599_900 * 1800) / 10_000));
  });
});

describe("M6b — coupons CRUD", () => {
  it("creates, lists, pauses a coupon (paused coupons stop redeeming); validates input", async () => {
    const adminT = (await login(ADMIN))!;

    const created = await app.inject({ method: "POST", url: "/v1/admin/coupons", headers: auth(adminT), payload: { code: "launch25", discount_type: "percent", value: 25 } });
    expect(created.statusCode).toBe(201);
    const coupon = (created.json() as { coupon: { id: string; code: string; value: number; status: string } }).coupon;
    expect(coupon).toMatchObject({ code: "LAUNCH25", value: 25, status: "active" });

    // Duplicate + bad values rejected.
    expect((await app.inject({ method: "POST", url: "/v1/admin/coupons", headers: auth(adminT), payload: { code: "LAUNCH25", discount_type: "percent", value: 10 } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/v1/admin/coupons", headers: auth(adminT), payload: { code: "TOOBIG", discount_type: "percent", value: 150 } })).statusCode).toBe(400);

    // Works at checkout while active…
    const { token } = await onboard("Coupon Co", "c@coupon.test");
    const v1 = await app.inject({ method: "POST", url: "/v1/billing/coupon/validate", headers: auth(token), payload: { code: "LAUNCH25", plan_code: "growth", interval: "monthly" } });
    expect((v1.json() as { discount_paise: number }).discount_paise).toBe(Math.round(499_900 * 0.25));

    // …and stops once paused.
    const paused = await app.inject({ method: "PATCH", url: `/v1/admin/coupons/${coupon.id}`, headers: auth(adminT), payload: { status: "paused" } });
    expect((paused.json() as { coupon: { status: string } }).coupon.status).toBe("paused");
    expect((await app.inject({ method: "POST", url: "/v1/billing/coupon/validate", headers: auth(token), payload: { code: "LAUNCH25", plan_code: "growth", interval: "monthly" } })).statusCode).toBe(400);

    const list = await app.inject({ method: "GET", url: "/v1/admin/coupons", headers: auth(adminT) });
    expect((list.json() as { coupons: unknown[] }).coupons).toHaveLength(1);
  });
});

describe("M6b — platform billing", () => {
  it("summarizes real revenue and lists cross-tenant invoices; admin refund drops the tenant to Free", async () => {
    const adminT = (await login(ADMIN))!;
    const a = await onboard("Rev A", "a@rev.test");
    const b = await onboard("Rev B", "b@rev.test");
    await upgrade(a.token);
    await upgrade(b.token);

    const sum = await app.inject({ method: "GET", url: "/v1/admin/billing/summary", headers: auth(adminT) });
    const s = sum.json() as { mrr: number; paying_tenants: number; arpu: number; collected_30d: number; plan_mix: Array<{ plan: string; tenants: number }> };
    expect(s.mrr).toBe(9998); // 2 × ₹4,999
    expect(s.paying_tenants).toBe(2);
    expect(s.arpu).toBe(4999);
    expect(s.collected_30d).toBe(11797.64); // 2 × ₹5,898.82 (incl GST)
    expect(s.plan_mix.find((p) => p.plan === "growth")!.tenants).toBe(2);

    const inv = await app.inject({ method: "GET", url: "/v1/admin/billing/invoices?q=Rev A", headers: auth(adminT) });
    const invoices = (inv.json() as { invoices: Array<{ id: string; company_name: string; status: string }> }).invoices;
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ company_name: "Rev A", status: "paid" });

    // Admin refunds via the existing hardened endpoint.
    const refund = await app.inject({ method: "POST", url: `/v1/billing/invoices/${invoices[0]!.id}/refund`, headers: auth(adminT) });
    expect(refund.statusCode).toBe(200);
    expect((await SubscriptionModel.findOne({ companyId: a.companyId, status: "active" }).lean())!.planCode).toBe("free");

    const afterRefund = await app.inject({ method: "GET", url: "/v1/admin/billing/summary", headers: auth(adminT) });
    expect((afterRefund.json() as { refunded_30d: number }).refunded_30d).toBe(5898.82);
  });
});

// keep the linter satisfied about the unused import in edge configs
void CouponModel;
