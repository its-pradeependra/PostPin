import { apiFetch, getAccessToken, refreshAccessToken } from "@/lib/api/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

export interface BillingPlan {
  id: string;
  name: string;
  tagline: string;
  priceMonthly: number; // rupees; -1 = custom
  priceYearly: number;
  includedCalls: number;
  rateLimitRpm: number;
  features: string[];
  highlight: boolean;
  badge?: string;
}

export interface InvoiceDto {
  id: string;
  number: string;
  plan: string;
  amount: number; // rupees
  status: "draft" | "open" | "paid" | "void" | "past_due";
  issuedAt: string;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface CheckoutResponse {
  order_id: string;
  amount_paise: number;
  currency: string;
  key_id: string;
  dev_mode: boolean;
  plan_code: string;
  plan_name: string;
  invoice_number: string;
}

export function getBillingPlans(): Promise<BillingPlan[]> {
  return apiFetch<{ plans: BillingPlan[] }>("/billing/plans").then((r) => r.plans);
}

export function getInvoices(): Promise<InvoiceDto[]> {
  return apiFetch<{ invoices: InvoiceDto[] }>("/billing/invoices").then((r) => r.invoices);
}

export interface CouponInfo {
  code: string;
  discount_paise: number;
  discount_rupees: number;
  discount_type: string;
  description: string;
}

export function validateCoupon(code: string, planCode: string, interval: "monthly" | "yearly") {
  return apiFetch<CouponInfo>("/billing/coupon/validate", { method: "POST", body: { code, plan_code: planCode, interval } });
}

export function checkout(planCode: string, interval: "monthly" | "yearly", couponCode?: string) {
  return apiFetch<CheckoutResponse>("/billing/checkout", {
    method: "POST",
    body: { plan_code: planCode, interval, ...(couponCode ? { coupon_code: couponCode } : {}) },
  });
}

/** Download a real server-rendered PDF invoice (binary — bypasses the JSON apiFetch,
 * so it does its own single 401→refresh→retry like apiFetch does). */
export async function downloadInvoicePdf(invoiceId: string, number: string) {
  const doFetch = () =>
    fetch(`${API_BASE}/billing/invoices/${invoiceId}/pdf`, {
      headers: { authorization: `Bearer ${getAccessToken() ?? ""}` },
      credentials: "include",
    });
  let res = await doFetch();
  if (res.status === 401 && (await refreshAccessToken())) res = await doFetch();
  if (!res.ok) throw new Error("Couldn't download the invoice PDF.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${number}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function verifyPayment(orderId: string, paymentId: string, signature: string) {
  return apiFetch<{ ok: boolean; plan_code: string }>("/billing/verify", {
    method: "POST",
    body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature },
  });
}

export function devCompleteCheckout(orderId: string) {
  return apiFetch<{ ok: boolean; plan_code: string }>("/billing/dev-complete", { method: "POST", body: { order_id: orderId } });
}

export function cancelSubscription() {
  return apiFetch<{ ok: boolean; cancel_at_period_end: boolean; current_period_end: string }>("/billing/cancel", { method: "POST" });
}

/* ── Razorpay Checkout (real-keys path) ─────────────────────────────
   With the dummy test keys the backend returns dev_mode:true and we take the
   simulate path; this loads the real hosted modal when real keys are present. */
interface RazorpayResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export async function openRazorpayCheckout(co: CheckoutResponse, opts: { name: string; email: string }): Promise<RazorpayResult> {
  const ok = await loadRazorpayScript();
  if (!ok) throw new Error("Could not load the Razorpay checkout.");
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rzp = new (window as any).Razorpay({
      key: co.key_id,
      order_id: co.order_id,
      amount: co.amount_paise,
      currency: co.currency,
      name: "Postpin",
      description: `${co.plan_name} plan`,
      prefill: { name: opts.name, email: opts.email },
      theme: { color: "#a21caf" },
      handler: (res: RazorpayResult) => resolve(res),
      modal: { ondismiss: () => reject(new Error("Checkout cancelled")) },
    });
    rzp.open();
  });
}
