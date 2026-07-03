import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hmacSha256 } from "@/lib/crypto.js";
import { CouponModel, InvoiceModel, PermissionModel, PlanModel, SubscriptionModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { refundInvoice } from "@/services/billing.service.js";
import { lastEmailFor } from "@/services/email.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
const WEBHOOK_SECRET = "test_webhook_secret";
let app: AppInstance;

async function seed() {
  await PermissionModel.insertMany(
    PERMISSIONS.map((p) => ({ key: p.key, resource: p.resource, action: p.action, group: p.group, scope: p.scope, description: p.description, isDangerous: "isDangerous" in p ? p.isDangerous : false })),
  );
  const common = { version: 1, rateLimit: { rpm: 30, rpd: 0, burst: 10 }, isActive: true, isPublic: true };
  await PlanModel.create({ code: "free", name: "Free", description: "Free", priceMonthlyPaise: 0, priceYearlyPaise: 0, includedCalls: 1000, maxApiKeys: 1, maxTeamMembers: 2, sortOrder: 0, ...common });
  await PlanModel.create({ code: "growth", name: "Growth", description: "Scale", priceMonthlyPaise: 499_900, priceYearlyPaise: 416_500, includedCalls: 250_000, overagePer1kPaise: 700, maxApiKeys: 10, maxTeamMembers: 10, sortOrder: 2, ...common });
  await CouponModel.create({ code: "SAVE20", discountType: "percent", value: 2000, status: "active" }); // 20%
}

async function onboard(email: string) {
  const r = await onboardCompany({ companyName: "Co", ownerName: "Owner", ownerEmail: email, password: PW, emailVerified: true });
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PW } });
  return { token: (res.json() as { access_token: string }).access_token, companyId: r.companyId };
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
async function checkout(t: string, coupon?: string) {
  const res = await app.inject({ method: "POST", url: "/v1/billing/checkout", headers: auth(t), payload: { plan_code: "growth", interval: "monthly", ...(coupon ? { coupon_code: coupon } : {}) } });
  return res.json() as { order_id: string; amount_paise: number; discount_paise: number };
}
async function pay(t: string, orderId: string) {
  return app.inject({ method: "POST", url: "/v1/billing/dev-complete", headers: auth(t), payload: { order_id: orderId } });
}
const invoiceFor = (orderId: string) => InvoiceModel.findOne({ razorpayOrderId: orderId });

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

describe("M4b — coupons", () => {
  it("validates a coupon and applies the discount at checkout", async () => {
    const { token, companyId } = await onboard("a@a.test");
    const v = await app.inject({ method: "POST", url: "/v1/billing/coupon/validate", headers: auth(token), payload: { code: "save20", plan_code: "growth", interval: "monthly" } });
    expect(v.statusCode).toBe(200);
    expect((v.json() as { discount_paise: number }).discount_paise).toBe(99_980); // 20% of 499,900

    const co = await checkout(token, "SAVE20");
    expect(co.discount_paise).toBe(99_980);
    // discounted base 399,920 + 18% GST 71,986 = 471,906
    expect(co.amount_paise).toBe(471_906);

    await pay(token, co.order_id);
    const coupon = await CouponModel.findOne({ code: "SAVE20" }).lean();
    expect(coupon?.redemptionCount).toBe(1);
    const sub = await SubscriptionModel.findOne({ companyId, status: "active" }).lean();
    expect(sub?.discountAppliedPaise).toBe(99_980);
  });

  it("rejects invalid, expired and plan-mismatched coupons", async () => {
    const { token } = await onboard("b@b.test");
    await CouponModel.create({ code: "EXPIRED", discountType: "percent", value: 1000, status: "active", validUntil: new Date(Date.now() - 86_400_000) });
    await CouponModel.create({ code: "STARTERONLY", discountType: "percent", value: 1000, status: "active", appliesToPlanCodes: ["starter"] });

    const bad = (code: string) => app.inject({ method: "POST", url: "/v1/billing/coupon/validate", headers: auth(token), payload: { code, plan_code: "growth", interval: "monthly" } });
    expect((await bad("NOPE")).statusCode).toBe(400);
    expect((await bad("EXPIRED")).statusCode).toBe(400);
    expect((await bad("STARTERONLY")).statusCode).toBe(400);
  });
});

describe("M4b — dunning", () => {
  it("flags the invoice past_due and emails the payer on a failed-payment webhook", async () => {
    const { token } = await onboard("dunning@x.test");
    const co = await checkout(token);
    const event = { event: "payment.failed", payload: { payment: { entity: { id: "pay_fail_1", order_id: co.order_id } } } };
    const raw = JSON.stringify(event);
    const hook = await app.inject({ method: "POST", url: "/v1/billing/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": hmacSha256(raw, WEBHOOK_SECRET) }, payload: raw });
    expect((hook.json() as { handled: boolean }).handled).toBe(true);

    expect((await invoiceFor(co.order_id))?.status).toBe("past_due");
    const email = lastEmailFor("dunning@x.test");
    expect(email?.subject).toMatch(/Payment failed/i);
  });
});

describe("M4b — refunds", () => {
  it("refunds a paid invoice (platform) and drops the tenant to Free; tenants can't refund", async () => {
    const { token, companyId } = await onboard("refund@x.test");
    const co = await checkout(token);
    await pay(token, co.order_id);
    const invoice = await invoiceFor(co.order_id);
    expect(invoice?.status).toBe("paid");

    // A tenant owner lacks the platform invoice:refund permission.
    const denied = await app.inject({ method: "POST", url: `/v1/billing/invoices/${invoice!._id}/refund`, headers: auth(token) });
    expect(denied.statusCode).toBe(403);

    // Refund via the service (platform action) → invoice refunded, tenant back on Free.
    await refundInvoice(String(invoice!._id));
    expect((await InvoiceModel.findById(invoice!._id))?.status).toBe("refunded");
    expect((await SubscriptionModel.findOne({ companyId, status: "active" }).lean())?.planCode).toBe("free");

    // Can't refund again.
    await expect(refundInvoice(String(invoice!._id))).rejects.toThrow();
  });
});

describe("M4b — review fixes (money-safety regressions)", () => {
  it("reserves coupon redemptions atomically at checkout — a capped coupon can't be over-redeemed via staged open checkouts", async () => {
    const { token } = await onboard("cap@x.test");
    await CouponModel.create({ code: "ONEUSE", discountType: "percent", value: 1000, status: "active", maxRedemptions: 1 });

    // First checkout reserves the only redemption (payment not yet captured).
    const first = await app.inject({ method: "POST", url: "/v1/billing/checkout", headers: auth(token), payload: { plan_code: "growth", interval: "monthly", coupon_code: "ONEUSE" } });
    expect(first.statusCode).toBe(200);
    expect((await CouponModel.findOne({ code: "ONEUSE" }).lean())?.redemptionCount).toBe(1);

    // Second checkout with the same code is rejected — no second under-priced order.
    const second = await app.inject({ method: "POST", url: "/v1/billing/checkout", headers: auth(token), payload: { plan_code: "growth", interval: "monthly", coupon_code: "ONEUSE" } });
    expect(second.statusCode).toBe(400);

    // Paying the first invoice does NOT double-increment.
    await pay(token, (first.json() as { order_id: string }).order_id);
    expect((await CouponModel.findOne({ code: "ONEUSE" }).lean())?.redemptionCount).toBe(1);
  });

  it("a refunded invoice can never be re-activated by a replayed capture (verify or webhook)", async () => {
    const { token, companyId } = await onboard("replay@x.test");
    const co = await checkout(token);
    await pay(token, co.order_id);
    const invoice = await invoiceFor(co.order_id);
    await refundInvoice(String(invoice!._id));
    expect((await InvoiceModel.findById(invoice!._id))?.status).toBe("refunded");

    // Replayed /verify with a VALID signature for the same order → rejected, state intact.
    const { paymentSignature } = await import("@/lib/razorpay.js");
    const sig = paymentSignature(co.order_id, "pay_replay_1");
    const replay = await app.inject({ method: "POST", url: "/v1/billing/verify", headers: auth(token), payload: { razorpay_order_id: co.order_id, razorpay_payment_id: "pay_replay_1", razorpay_signature: sig } });
    expect(replay.statusCode).toBe(400);

    // Replayed signed webhook capture → no state change either.
    const event = { event: "payment.captured", payload: { payment: { entity: { id: "pay_replay_2", order_id: co.order_id } } } };
    const raw = JSON.stringify(event);
    await app.inject({ method: "POST", url: "/v1/billing/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": hmacSha256(raw, WEBHOOK_SECRET) }, payload: raw });

    expect((await InvoiceModel.findById(invoice!._id))?.status).toBe("refunded");
    expect((await SubscriptionModel.findOne({ companyId, status: "active" }).lean())?.planCode).toBe("free");
  });

  it("a late payment.failed webhook never clobbers a PAID invoice", async () => {
    const { token, companyId } = await onboard("late@x.test");
    const co = await checkout(token);
    await pay(token, co.order_id);

    const event = { event: "payment.failed", payload: { payment: { entity: { id: "pay_late", order_id: co.order_id } } } };
    const raw = JSON.stringify(event);
    await app.inject({ method: "POST", url: "/v1/billing/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": hmacSha256(raw, WEBHOOK_SECRET) }, payload: raw });

    expect((await invoiceFor(co.order_id))?.status).toBe("paid");
    expect((await SubscriptionModel.findOne({ companyId, status: "active" }).lean())?.planCode).toBe("growth");
  });
});

describe("M4b — invoice PDF", () => {
  it("downloads a paid invoice as application/pdf", async () => {
    const { token } = await onboard("pdf@x.test");
    const co = await checkout(token);
    await pay(token, co.order_id);
    const invoice = await invoiceFor(co.order_id);

    const res = await app.inject({ method: "GET", url: `/v1/billing/invoices/${invoice!._id}/pdf`, headers: auth(token) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
