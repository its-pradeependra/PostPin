import { apiFetch } from "@/lib/api/client";

/* ── Public platform status (status page) ─────────────────────────── */

export type ComponentStatus = "operational" | "degraded" | "outage";

export interface PublicStatus {
  overall: ComponentStatus;
  updated_at: string;
  components: Array<{ id: string; name: string; status: ComponentStatus; uptime_pct: number }>;
  uptime_90d_pct: number;
  avg_latency_24h_ms: number;
  requests_24h: number;
  history: Array<{ date: string; status: ComponentStatus | "no_data" }>;
}

export function getPublicStatus() {
  return apiFetch<{ data: PublicStatus }>("/public/status").then((r) => r.data);
}

/* ── Public platform stats (marketing pages) ──────────────────────── */

export interface PublicStats {
  pincodes: number;
  metros: number;
  states: number;
  public_plans: number;
  zones: Array<{ code: string; name: string; tier: number; description: string; sla_min: number; sla_max: number; is_special: boolean }>;
}

export function getPublicStats() {
  return apiFetch<{ data: PublicStats }>("/public/stats").then((r) => r.data);
}

/* ── Contact / sales form ─────────────────────────────────────────── */

export interface ContactInput {
  name: string;
  email: string;
  company?: string;
  topic?: string;
  message: string;
}

/** Delivers the enquiry to the platform team's inbox (rate-limited server-side). */
export function submitContactForm(input: ContactInput) {
  return apiFetch<{ data: { received: boolean } }>("/public/contact", { method: "POST", body: input }).then((r) => r.data);
}

/* ── Public plans (pricing page, landing strip, signup chip) ──────── */

export interface PublicPlan {
  code: string;
  name: string;
  description: string;
  price_monthly_paise: number;
  price_yearly_paise: number;
  included_calls: number;
  rate_limit: { rpm: number };
  max_api_keys: number;
  max_team_members: number;
  features: string[];
  sort_order: number;
}

export function getPublicPlans() {
  return apiFetch<{ data: PublicPlan[] }>("/public/plans").then((r) => r.data);
}

/* ── Pincode lookup (tools + directory widgets) ─────────────────────── */

export interface PublicPincodeDetail {
  pincode: string;
  office_name: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  state_slug: string | null;
  district_slug: string | null;
  is_metro: boolean;
  is_remote: boolean;
  serviceable: { prepaid: boolean; cod: boolean; pickup: boolean };
  nearby: { pincode: string; city: string | null; is_metro: boolean }[];
}

/** Full public detail for one pincode. Throws ApiError(404) when unknown. */
export function getPublicPincode(code: string) {
  return apiFetch<{ data: PublicPincodeDetail }>(`/public/pincodes/${code}`).then((r) => r.data);
}
