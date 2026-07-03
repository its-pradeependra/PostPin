import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hmacSha256 } from "@/lib/crypto.js";
import { paymentSignature } from "@/lib/razorpay.js";
import { InvoiceModel, PermissionModel, PlanModel, SubscriptionModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
const WEBHOOK_SECRET = "test_webhook_secret"; // matches vitest.config test.env
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
  const common = { version: 1, rateLimit: { rpm: 30, rpd: 0, burst: 10 }, isActive: true, isPublic: true };
  await PlanModel.create({ code: "free", name: "Free", description: "Free", priceMonthlyPaise: 0, priceYearlyPaise: 0, includedCalls: 1000, maxApiKeys: 1, maxTeamMembers: 2, sortOrder: 0, ...common });
  await PlanModel.create({ code: "growth", name: "Growth", description: "For scaling", priceMonthlyPaise: 499_900, priceYearlyPaise: 416_500, includedCalls: 250_000, overagePer1kPaise: 700, maxApiKeys: 10, maxTeamMembers: 10, sortOrder: 2, ...common });
}

async function onboard(name: string, email: string) {
  const r = await onboardCompany({ companyName: name, ownerName: "Owner", ownerEmail: email, password: PW, emailVerified: true });
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PW } });
  return { token: (res.json() as { access_token: string }).access_token, companyId: r.companyId };
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const activePlan = async (companyId: unknown) => (await SubscriptionModel.findOne({ companyId, status: "active" }).lean())?.planCode;
async function checkout(t: string, plan = "growth", interval = "monthly") {
  const res = await app.inject({ method: "POST", url: "/v1/billing/checkout", headers: auth(t), payload: { plan_code: plan, interval } });
  return res.json() as { order_id: string; amount_paise: number; dev_mode: boolean; invoice_number: string };
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

describe("M4 — billing checkout + activation", () => {
  it("requires auth and lists plans", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/billing/plans" })).statusCode).toBe(401);
    const { token } = await onboard("Alpha Co", "a@alpha.test");
    const res = await app.inject({ method: "GET", url: "/v1/billing/plans", headers: auth(token) });
    const growth = (res.json() as { plans: Array<{ id: string; priceMonthly: number }> }).plans.find((p) => p.id === "growth");
    expect(growth?.priceMonthly).toBe(4999);
  });

  it("creates a checkout order + open invoice, then activates via dev-complete", async () => {
    const { token, companyId } = await onboard("Beta Co", "b@beta.test");
    expect(await activePlan(companyId)).toBe("free");

    const co = await checkout(token, "growth", "monthly");
    expect(co.dev_mode).toBe(true); // dummy/no keys in tests → simulate path
    expect(co.amount_paise).toBe(499_900 + Math.round((499_900 * 1800) / 10_000)); // base + 18% GST = 589,882
    expect(co.order_id).toMatch(/^order_dev_/);

    const invBefore = await InvoiceModel.findOne({ razorpayOrderId: co.order_id }).lean();
    expect(invBefore?.status).toBe("open");

    const done = await app.inject({ method: "POST", url: "/v1/billing/dev-complete", headers: auth(token), payload: { order_id: co.order_id } });
    expect(done.statusCode).toBe(200);
    expect((done.json() as { plan_code: string }).plan_code).toBe("growth");

    expect(await activePlan(companyId)).toBe("growth"); // subscription upgraded
    const inv = await InvoiceModel.findOne({ razorpayOrderId: co.order_id }).lean();
    expect(inv?.status).toBe("paid");
    expect(inv?.razorpayPaymentId).toBeTruthy();

    const list = await app.inject({ method: "GET", url: "/v1/billing/invoices", headers: auth(token) });
    const invoices = (list.json() as { invoices: Array<{ status: string; amount: number }> }).invoices;
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ status: "paid", amount: 5898.82 });
  });

  it("rejects a bad payment signature and accepts a valid one", async () => {
    const { token, companyId } = await onboard("Gamma Co", "g@gamma.test");

    const bad = await checkout(token);
    const badRes = await app.inject({ method: "POST", url: "/v1/billing/verify", headers: auth(token), payload: { razorpay_order_id: bad.order_id, razorpay_payment_id: "pay_x", razorpay_signature: "deadbeef" } });
    expect(badRes.statusCode).toBe(400);
    expect(await activePlan(companyId)).toBe("free"); // not upgraded on bad signature

    const good = await checkout(token);
    const paymentId = "pay_test_123";
    const sig = paymentSignature(good.order_id, paymentId); // signed with the same key_secret Razorpay would use
    const okRes = await app.inject({ method: "POST", url: "/v1/billing/verify", headers: auth(token), payload: { razorpay_order_id: good.order_id, razorpay_payment_id: paymentId, razorpay_signature: sig } });
    expect(okRes.statusCode).toBe(200);
    expect(await activePlan(companyId)).toBe("growth");
  });

  it("activates from a signed Razorpay webhook and rejects an unsigned one", async () => {
    const { token, companyId } = await onboard("Delta Co", "d@delta.test");
    const co = await checkout(token);

    const event = { event: "payment.captured", payload: { payment: { entity: { id: "pay_hook_1", order_id: co.order_id } } } };
    const rawBody = JSON.stringify(event);

    // Unsigned/invalid → 400, no activation.
    const badHook = await app.inject({ method: "POST", url: "/v1/billing/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": "nope" }, payload: rawBody });
    expect(badHook.statusCode).toBe(400);
    expect(await activePlan(companyId)).toBe("free");

    // Correctly signed → activates.
    const sig = hmacSha256(rawBody, WEBHOOK_SECRET);
    const okHook = await app.inject({ method: "POST", url: "/v1/billing/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sig }, payload: rawBody });
    expect(okHook.statusCode).toBe(200);
    expect((okHook.json() as { handled: boolean }).handled).toBe(true);
    expect(await activePlan(companyId)).toBe("growth");
  });

  it("cancels a paid subscription at period end", async () => {
    const { token, companyId } = await onboard("Eps Co", "e@eps.test");
    // On Free → nothing to cancel.
    expect((await app.inject({ method: "POST", url: "/v1/billing/cancel", headers: auth(token) })).statusCode).toBe(400);

    const co = await checkout(token);
    await app.inject({ method: "POST", url: "/v1/billing/dev-complete", headers: auth(token), payload: { order_id: co.order_id } });
    const cancel = await app.inject({ method: "POST", url: "/v1/billing/cancel", headers: auth(token) });
    expect(cancel.statusCode).toBe(200);
    expect((cancel.json() as { cancel_at_period_end: boolean }).cancel_at_period_end).toBe(true);
    const sub = await SubscriptionModel.findOne({ companyId, status: "active" }).lean();
    expect(sub?.cancelAtPeriodEnd).toBe(true);
  });

  it("keeps invoices isolated between tenants", async () => {
    const a = await onboard("Iso A", "a@iso.test");
    const b = await onboard("Iso B", "b@iso.test");
    const co = await checkout(a.token);
    await app.inject({ method: "POST", url: "/v1/billing/dev-complete", headers: auth(a.token), payload: { order_id: co.order_id } });

    const bList = await app.inject({ method: "GET", url: "/v1/billing/invoices", headers: auth(b.token) });
    expect((bList.json() as { invoices: unknown[] }).invoices).toHaveLength(0);
    // B can't complete A's order (scoped lookup → not found).
    const steal = await app.inject({ method: "POST", url: "/v1/billing/dev-complete", headers: auth(b.token), payload: { order_id: co.order_id } });
    expect(steal.statusCode).toBe(404);
  });
});
