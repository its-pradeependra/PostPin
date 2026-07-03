import { env, isProd, isTest } from "@/config/env.js";
import { hmacSha256, timingSafeEqualStr } from "@/lib/crypto.js";
import { logger } from "@/lib/logger.js";

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

/**
 * Create a Razorpay order. Talks to the real Razorpay API (needs valid test
 * keys). Returns null if the API is unreachable / keys are invalid so callers
 * can fall back to a dev-simulated order in non-production.
 */
export async function createRazorpayOrder(input: {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder | null> {
  if (isTest || !razorpayConfigured()) return null; // never hit the network in tests → dev-simulate path
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency ?? "INR",
        receipt: input.receipt,
        notes: input.notes ?? {},
        payment_capture: 1,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      logger.warn({ status: res.status }, "Razorpay order create failed (likely test/dummy keys)");
      return null;
    }
    return (await res.json()) as RazorpayOrder;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Razorpay order create errored");
    return null;
  }
}

/** Refund a captured payment (full or partial).
 * Returns { skipped: true } when there is intentionally nothing to refund at
 * Razorpay (tests / unconfigured keys / simulated payments), and null ONLY on a
 * real API failure — callers must NOT mutate state on null. */
export async function createRazorpayRefund(
  paymentId: string,
  amountPaise?: number,
): Promise<{ id: string; status: string } | { skipped: true } | null> {
  if (isTest || !razorpayConfigured() || paymentId.startsWith("pay_sim_") || paymentId.startsWith("pay_hook_")) {
    return { skipped: true };
  }
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API}/payments/${paymentId}/refund`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify(amountPaise ? { amount: amountPaise } : {}),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      logger.warn({ status: res.status }, "Razorpay refund failed");
      return null;
    }
    return (await res.json()) as { id: string; status: string };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Razorpay refund errored");
    return null;
  }
}

/** The signature Razorpay Checkout returns: HMAC_SHA256(order_id|payment_id, key_secret). */
export function paymentSignature(orderId: string, paymentId: string): string {
  return hmacSha256(`${orderId}|${paymentId}`, env.RAZORPAY_KEY_SECRET);
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  return timingSafeEqualStr(paymentSignature(orderId, paymentId), signature);
}

/** Verify a Razorpay webhook: HMAC_SHA256(rawBody, webhook_secret) == X-Razorpay-Signature. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  return timingSafeEqualStr(hmacSha256(rawBody, env.RAZORPAY_WEBHOOK_SECRET), signature);
}

/** Dev-only: fabricate a payment id + valid signature to simulate a successful checkout. */
export function simulatePayment(orderId: string): { paymentId: string; signature: string } {
  if (isProd) throw new Error("simulatePayment is not available in production");
  const paymentId = `pay_sim_${Math.random().toString(36).slice(2, 16)}`;
  return { paymentId, signature: paymentSignature(orderId, paymentId) };
}
