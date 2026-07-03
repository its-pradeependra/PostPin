import type { Types } from "mongoose";
import { getContext } from "@/context/request-context.js";
import { env, isProd } from "@/config/env.js";
import { randomToken } from "@/lib/crypto.js";
import { AppError } from "@/lib/errors.js";
import { logger } from "@/lib/logger.js";
import { CompanyModel, CouponModel, InvoiceModel, PlanModel, SubscriptionModel, UserModel } from "@/models/index.js";
import { scopedRepo } from "@/tenancy/scoped-repo.js";
import { writeAudit } from "@/services/audit.service.js";
import { createNotification } from "@/services/notification.service.js";
import { sendDunningEmail } from "@/services/email.service.js";
import { createRazorpayOrder, createRazorpayRefund, simulatePayment, verifyPaymentSignature } from "@/lib/razorpay.js";

const GST_BPS = 1800; // 18%
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const rupees = (paise: number) => (paise < 0 ? -1 : Math.round(paise) / 100);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function planDto(p: any) {
  return {
    id: p.code,
    name: p.name,
    tagline: p.description,
    priceMonthly: rupees(p.priceMonthlyPaise),
    priceYearly: rupees(p.priceYearlyPaise),
    includedCalls: p.includedCalls,
    overagePer1k: p.overagePer1kPaise != null ? p.overagePer1kPaise / 100 : 0,
    rateLimitRpm: p.rateLimit?.rpm ?? 0,
    features: p.features ?? [],
    highlight: p.code === "growth",
    badge: p.code === "growth" ? "Most popular" : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invoiceDto(i: any, planNameByCode?: Map<string, string>) {
  return {
    id: String(i._id),
    number: i.number,
    plan: planNameByCode?.get(i.planCode) ?? i.planCode,
    amount: rupees(i.totalPaise),
    status: i.status,
    issuedAt: i.issuedAt,
    paidAt: i.paidAt ?? null,
    periodStart: i.periodStart ?? null,
    periodEnd: i.periodEnd ?? null,
  };
}

export async function listPlans() {
  const plans = await PlanModel.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  return { plans: plans.map(planDto) };
}

async function planNameMap(): Promise<Map<string, string>> {
  const plans = await PlanModel.find().select("code name").lean();
  return new Map(plans.map((p) => [p.code as string, p.name as string]));
}

export async function listInvoices() {
  const [rows, names] = await Promise.all([
    scopedRepo(InvoiceModel).find().sort({ createdAt: -1 }).limit(100).lean(),
    planNameMap(),
  ]);
  return { invoices: rows.map((i) => invoiceDto(i, names)) };
}

function makeInvoiceNumber(): string {
  const year = new Date().getFullYear();
  return `INV-${year}-${Math.floor(100000 + Math.random() * 900000)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeDiscount(coupon: any, basePaise: number, monthlyPaise: number): number {
  let d = 0;
  if (coupon.discountType === "percent") d = Math.round((basePaise * coupon.value) / 10_000);
  else if (coupon.discountType === "flat") d = coupon.value;
  else if (coupon.discountType === "free_months") d = coupon.value * monthlyPaise;
  return Math.min(Math.max(0, d), basePaise); // never below 0 or above the base
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeCoupon(coupon: any): string {
  if (coupon.discountType === "percent") return `${coupon.value / 100}% off`;
  if (coupon.discountType === "flat") return `${rupees(coupon.value)} off`;
  return `${coupon.value} month${coupon.value === 1 ? "" : "s"} free`;
}

/** Validate a coupon for a plan/interval and compute the discount (paise). Throws on invalid. */
export async function validateCoupon(input: { code: string; planCode: string; interval: "monthly" | "yearly" }) {
  const { companyId } = getContext();
  const code = input.code.trim().toUpperCase();
  const coupon = await CouponModel.findOne({ code }).lean();
  if (!coupon) throw AppError.badRequest("That coupon code isn't valid", "coupon_invalid");
  const now = Date.now();
  if (coupon.status !== "active") throw AppError.badRequest("This coupon is no longer active", "coupon_inactive");
  if (coupon.validFrom && +new Date(coupon.validFrom) > now) throw AppError.badRequest("This coupon isn't active yet", "coupon_not_started");
  if (coupon.validUntil && +new Date(coupon.validUntil) < now) throw AppError.badRequest("This coupon has expired", "coupon_expired");
  if (coupon.maxRedemptions != null && (coupon.redemptionCount ?? 0) >= coupon.maxRedemptions) {
    throw AppError.badRequest("This coupon has reached its redemption limit", "coupon_exhausted");
  }
  if (coupon.companyId && String(coupon.companyId) !== String(companyId)) {
    throw AppError.badRequest("This coupon isn't valid for your account", "coupon_invalid");
  }
  if (coupon.appliesToPlanCodes?.length && !coupon.appliesToPlanCodes.includes(input.planCode)) {
    throw AppError.badRequest(`This coupon doesn't apply to the selected plan`, "coupon_plan_mismatch");
  }
  const plan = await PlanModel.findOne({ code: input.planCode }).lean();
  if (!plan) throw AppError.badRequest("Unknown plan", "invalid_plan");
  const basePaise = input.interval === "yearly" ? plan.priceYearlyPaise * 12 : plan.priceMonthlyPaise;
  if (basePaise <= 0) throw AppError.badRequest("This plan can't use coupons", "not_purchasable");
  const discountPaise = computeDiscount(coupon, basePaise, plan.priceMonthlyPaise);
  return { code, discount_paise: discountPaise, discount_rupees: rupees(discountPaise), discount_type: coupon.discountType, description: describeCoupon(coupon) };
}

/** Create a Razorpay order + an OPEN invoice for a paid-plan checkout. */
export async function createCheckout(input: { planCode: string; interval: "monthly" | "yearly"; couponCode?: string }) {
  const ctx = getContext();
  const plan = await PlanModel.findOne({ code: input.planCode, isActive: true }).lean();
  if (!plan) throw AppError.badRequest("Unknown plan", "invalid_plan");

  const basePaise = input.interval === "yearly" ? plan.priceYearlyPaise * 12 : plan.priceMonthlyPaise;
  if (basePaise <= 0) {
    throw AppError.badRequest("This plan can't be purchased here — it's free or custom-priced", "not_purchasable");
  }

  let discountPaise = 0;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const v = await validateCoupon({ code: input.couponCode, planCode: input.planCode, interval: input.interval });
    // Reserve the redemption ATOMICALLY at checkout (guarded $inc). Doing it at
    // activation would let N open checkouts all pass the cap check and each
    // capture an under-priced payment (the discount is baked into totalPaise here).
    const reserved = await CouponModel.findOneAndUpdate(
      {
        code: v.code,
        $or: [{ maxRedemptions: null }, { $expr: { $lt: ["$redemptionCount", "$maxRedemptions"] } }],
      },
      { $inc: { redemptionCount: 1 } },
      { new: true },
    );
    if (!reserved) throw AppError.badRequest("This coupon has reached its redemption limit", "coupon_exhausted");
    discountPaise = v.discount_paise;
    couponCode = v.code;
  }
  const discountedBase = Math.max(0, basePaise - discountPaise);
  const gstPaise = Math.round((discountedBase * GST_BPS) / 10_000);
  const totalPaise = discountedBase + gstPaise;

  let number = makeInvoiceNumber();
  const order = await createRazorpayOrder({
    amountPaise: totalPaise,
    receipt: number,
    notes: { companyId: String(ctx.companyId), planCode: plan.code, interval: input.interval },
  });
  // In dev/test we always simulate the payment (the interactive Razorpay modal
  // can't be driven headlessly). Production uses the real hosted checkout.
  const devMode = !isProd;
  const orderId = order?.id ?? `order_dev_${randomToken(12)}`;

  // Create the OPEN invoice (retry number on the rare collision).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let invoice: any = null;
  for (let attempt = 0; attempt < 6 && !invoice; attempt++) {
    try {
      invoice = await scopedRepo(InvoiceModel).create({
        number,
        planCode: plan.code,
        interval: input.interval,
        amountPaise: discountedBase,
        discountPaise,
        gstPaise,
        totalPaise,
        status: "open",
        couponCode,
        razorpayOrderId: orderId,
        lineItems: [
          { label: `${plan.name} plan (${input.interval})`, amountPaise: basePaise },
          ...(discountPaise > 0 ? [{ label: `Coupon ${couponCode}`, amountPaise: -discountPaise }] : []),
          { label: "GST (18%)", amountPaise: gstPaise },
        ],
        createdByUserId: ctx.userId,
      });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000 || attempt === 5) throw e;
      number = makeInvoiceNumber();
    }
  }

  return {
    order_id: orderId,
    amount_paise: totalPaise,
    currency: "INR",
    key_id: env.RAZORPAY_KEY_ID,
    dev_mode: devMode,
    plan_code: plan.code,
    plan_name: plan.name,
    invoice_number: invoice.number,
    discount_paise: discountPaise,
    coupon_code: couponCode,
  };
}

/** Mark an invoice paid and move the tenant onto its plan. Claims the invoice
 * with an atomic compare-and-swap so webhook + verify racing each other produce
 * exactly one activation, and terminal invoices (refunded/void) can NEVER be
 * re-activated by a replayed capture. Returns the claimed doc, or null if the
 * invoice was already paid / not in an activatable state. Context-less safe. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function activateFromInvoice(invoice: any, paymentId: string) {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + (invoice.interval === "yearly" ? YEAR_MS : MONTH_MS));

  // Only open (or dunning-recovered past_due) invoices may become paid.
  const claimed = await InvoiceModel.findOneAndUpdate(
    { _id: invoice._id, status: { $in: ["open", "past_due"] } },
    { $set: { status: "paid", razorpayPaymentId: paymentId, paidAt: now, periodStart: now, periodEnd } },
    { new: true },
  );
  if (!claimed) {
    if (invoice.status !== "paid") {
      logger.warn({ invoiceId: String(invoice._id), status: invoice.status }, "activateFromInvoice: ignoring capture for terminal invoice");
    }
    return null; // already paid (idempotent) or terminal — no side effects
  }

  const plan = await PlanModel.findOne({ code: claimed.planCode }).lean();
  if (!plan) {
    logger.error({ planCode: claimed.planCode }, "activateFromInvoice: plan missing");
    return claimed;
  }
  const periodKey = now.toISOString().slice(0, 7);
  const sub = await SubscriptionModel.findOne({ companyId: claimed.companyId, status: "active" });
  if (sub) {
    sub.planId = plan._id;
    sub.planCode = plan.code;
    sub.interval = claimed.interval;
    sub.priceSnapshotPaise = claimed.amountPaise;
    sub.currentPeriodStart = now;
    sub.currentPeriodEnd = periodEnd;
    sub.cancelAtPeriodEnd = false;
    sub.canceledAt = null;
    sub.paymentProvider = "razorpay";
    sub.set("usage.includedCalls", plan.includedCalls);
    sub.set("usage.periodKey", periodKey);
    await sub.save();
    claimed.subscriptionId = sub._id;
    await claimed.save();
  }

  // The redemption was already reserved atomically at checkout — just link it.
  if (claimed.couponCode && sub) {
    const coupon = await CouponModel.findOne({ code: claimed.couponCode }).lean();
    if (coupon) {
      sub.couponId = coupon._id;
      sub.discountAppliedPaise = claimed.discountPaise ?? 0;
      await sub.save();
    }
  }

  await writeAudit({
    action: "billing.payment_captured",
    category: "billing",
    companyId: claimed.companyId,
    resource: { kind: "invoice", id: String(claimed._id), name: claimed.number },
    metadata: { planCode: claimed.planCode, amountPaise: claimed.totalPaise },
  });
  void createNotification({
    recipientId: claimed.createdByUserId,
    companyId: claimed.companyId,
    kind: "billing",
    type: "invoice.paid",
    severity: "success",
    title: `You're on the ${plan.name} plan`,
    body: `Payment received — invoice ${claimed.number}.`,
    actionUrl: "/app/billing",
  });
  return claimed;
}

/** Verify a Razorpay Checkout callback and activate the plan. */
export async function verifyPayment(input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const invoice = await scopedRepo(InvoiceModel).findOne({ razorpayOrderId: input.razorpay_order_id });
  if (!invoice) throw AppError.notFound("Order not found");
  if (!verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    await writeAudit({
      action: "billing.signature_invalid",
      category: "billing",
      severity: "warning",
      outcome: "failure",
      resource: { kind: "invoice", id: String(invoice._id), name: invoice.number },
    });
    throw AppError.badRequest("Payment signature verification failed", "invalid_signature");
  }
  const claimed = await activateFromInvoice(invoice, input.razorpay_payment_id);
  // claimed=null means either an idempotent re-verify (already paid → fine) or a
  // terminal invoice (refunded/void → must NOT report success).
  const fresh = claimed ?? (await InvoiceModel.findById(invoice._id).lean());
  if (!fresh || fresh.status !== "paid") {
    throw AppError.badRequest("This order can no longer be completed", "order_not_payable");
  }
  return { ok: true, plan_code: fresh.planCode, invoice: invoiceDto(fresh) };
}

/** Dev/test only: simulate a successful Razorpay payment for an OPEN order. */
export async function devCompleteCheckout(orderId: string) {
  if (isProd) throw AppError.forbidden("Not available in production");
  const invoice = await scopedRepo(InvoiceModel).findOne({ razorpayOrderId: orderId });
  if (!invoice) throw AppError.notFound("Order not found");
  const { paymentId, signature } = simulatePayment(orderId);
  return verifyPayment({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature });
}

/** Razorpay webhook handler (signature already verified at the route). Source of
 * truth for payment capture — activates by order id, no tenant context needed. */
export async function handleWebhookEvent(event: { event: string; payload: Record<string, unknown> }) {
  const captureEvents = ["payment.captured", "order.paid"];
  const failEvents = ["payment.failed"];
  if (![...captureEvents, ...failEvents].includes(event.event)) return { handled: false };

  // Dig the order id + payment id out of the event payload.
  const entity =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((event.payload?.payment as any)?.entity ?? (event.payload?.order as any)?.entity ?? {}) as Record<string, unknown>;
  const orderId = String(entity.order_id ?? entity.id ?? "");
  const paymentId = String(entity.id ?? entity.payment_id ?? `pay_hook_${randomToken(8)}`);
  if (!orderId) return { handled: false };

  const invoice = await InvoiceModel.findOne({ razorpayOrderId: orderId });
  if (!invoice) return { handled: false };
  if (failEvents.includes(event.event)) {
    await markPaymentFailed(invoice);
  } else {
    await activateFromInvoice(invoice, paymentId);
  }
  return { handled: true };
}

/** Dunning: a payment failed — flag the invoice past-due, track the attempt, email + notify the payer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markPaymentFailed(invoice: any) {
  // CAS: only an OPEN invoice becomes past_due — a racing/late failure event can
  // never clobber a captured (paid) or terminal invoice, and re-delivery no-ops.
  const flagged = await InvoiceModel.findOneAndUpdate(
    { _id: invoice._id, status: "open" },
    { $set: { status: "past_due" } },
    { new: true },
  );
  if (!flagged) return;
  invoice = flagged;

  // Keep the subscription active during the grace period; just track the dunning attempt.
  const sub = await SubscriptionModel.findOne({ companyId: invoice.companyId, status: "active" });
  if (sub) {
    sub.set("dunning.attempts", (sub.dunning?.attempts ?? 0) + 1);
    sub.set("dunning.lastAttemptAt", new Date());
    await sub.save();
  }

  const plan = await PlanModel.findOne({ code: invoice.planCode }).lean();
  const user = invoice.createdByUserId ? await UserModel.findById(invoice.createdByUserId).select("email").lean() : null;
  if (user?.email) {
    await sendDunningEmail(user.email, { invoiceNumber: invoice.number, planName: plan?.name ?? invoice.planCode, amount: `₹${rupees(invoice.totalPaise)}` });
  }
  void createNotification({
    recipientId: invoice.createdByUserId,
    companyId: invoice.companyId,
    kind: "billing",
    type: "payment.failed",
    severity: "error",
    title: "Payment failed",
    body: `We couldn't process payment for invoice ${invoice.number}. Please retry to keep your plan.`,
    actionUrl: "/app/billing",
  });
  await writeAudit({
    action: "billing.payment_failed",
    category: "billing",
    severity: "warning",
    companyId: invoice.companyId,
    resource: { kind: "invoice", id: String(invoice._id), name: invoice.number },
  });
}

/** Platform (invoice:refund): refund a paid invoice and drop the tenant to Free. Cross-tenant. */
export async function refundInvoice(invoiceId: string) {
  const invoice = await InvoiceModel.findById(invoiceId);
  if (!invoice) throw AppError.notFound("Invoice not found");
  if (invoice.status !== "paid") throw AppError.badRequest("Only paid invoices can be refunded", "not_refundable");
  if (!invoice.razorpayPaymentId) throw AppError.badRequest("This invoice has no captured payment to refund", "no_payment");

  // Real refund via Razorpay when the payment was real; simulated payments are
  // skipped ({skipped:true}). A null return = the Razorpay API actually FAILED —
  // abort with the invoice untouched so the refund stays retryable.
  const refund = await createRazorpayRefund(invoice.razorpayPaymentId, invoice.totalPaise);
  if (refund === null) {
    throw new AppError("refund_failed", "Razorpay refund failed — the invoice is unchanged, please retry", 502);
  }
  const refundId = "skipped" in refund ? "simulated" : refund.id;
  invoice.status = "refunded";
  await invoice.save();

  const free = await PlanModel.findOne({ code: "free" }).lean();
  const sub = await SubscriptionModel.findOne({ companyId: invoice.companyId, status: "active" });
  if (sub && free) {
    sub.planId = free._id;
    sub.planCode = "free";
    sub.priceSnapshotPaise = 0;
    sub.cancelAtPeriodEnd = false;
    sub.set("usage.includedCalls", free.includedCalls);
    await sub.save();
  }
  await writeAudit({
    action: "invoice.refunded",
    category: "billing",
    severity: "warning",
    companyId: invoice.companyId,
    resource: { kind: "invoice", id: String(invoice._id), name: invoice.number },
    metadata: { amountPaise: invoice.totalPaise, refundId },
  });
  void createNotification({
    recipientId: invoice.createdByUserId,
    companyId: invoice.companyId,
    kind: "billing",
    type: "invoice.refunded",
    severity: "warning",
    title: "Payment refunded",
    body: `Invoice ${invoice.number} was refunded. Your account has been moved to the Free plan.`,
    actionUrl: "/app/billing",
  });
  return { ok: true, refund_id: refundId === "simulated" ? null : refundId, invoice: invoiceDto(invoice) };
}

/** A tenant downloads their own invoice as a PDF. */
export async function invoicePdf(invoiceId: string): Promise<{ filename: string; pdf: Buffer }> {
  const invoice = (await scopedRepo(InvoiceModel).findById(invoiceId).lean()) as Record<string, unknown> | null;
  if (!invoice) throw AppError.notFound("Invoice not found");
  const company = (await CompanyModel.findById(invoice.companyId as Types.ObjectId).select("name").lean()) as { name?: string } | null;
  const { renderInvoicePdf } = await import("@/lib/invoice-pdf.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await renderInvoicePdf(invoice as any, company?.name ?? "Customer");
  return { filename: `${invoice.number}.pdf`, pdf };
}

export async function cancelSubscription() {
  const { companyId } = getContext();
  const sub = await SubscriptionModel.findOne({ companyId, status: "active" });
  if (!sub) throw AppError.notFound("No active subscription");
  if (sub.planCode === "free") throw AppError.badRequest("You're on the Free plan — nothing to cancel", "already_free");
  sub.cancelAtPeriodEnd = true;
  sub.canceledAt = new Date();
  await sub.save();
  await writeAudit({ action: "billing.subscription_canceled", category: "billing", severity: "notice", resource: { kind: "subscription", id: String(sub._id) } });
  return { ok: true, cancel_at_period_end: true, current_period_end: sub.currentPeriodEnd };
}
