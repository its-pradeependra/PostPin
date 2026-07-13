/**
 * Public types for the Postpin API. These mirror the live JSON responses
 * exactly (verified against the API), so what you see is what you get.
 */

/** Service levels the rate engine prices. */
export type ServiceLevel = "surface" | "express" | "same_day";

/** Per-call options accepted by every resource method. */
export interface RequestOptions {
  /** Abort the request early (composed with the client timeout). */
  signal?: AbortSignal;
  /** Override the idempotency key for a write (POST). Auto-generated otherwise. */
  idempotencyKey?: string;
}

/** Envelope `meta` returned alongside every successful response. */
export interface ResponseMeta {
  request_id: string;
  api_version?: string;
  cached?: boolean;
  /** Rate endpoint only: server-side engine time in ms. */
  engine_ms?: number;
  /** List endpoints only. */
  total?: number;
  has_more?: boolean;
}

// ── Rates ────────────────────────────────────────────────────────────────────

export interface RateCalculateParams {
  /** 6-digit origin pincode. */
  origin: string;
  /** 6-digit destination pincode. */
  destination: string;
  /** Actual weight in grams. */
  weight: number;
  /** Package length in cm (for volumetric weight). */
  length?: number;
  /** Package width in cm. */
  width?: number;
  /** Package height in cm. */
  height?: number;
  /** Defaults to "surface". */
  service?: ServiceLevel;
  /** Cash-on-delivery — adds COD handling. */
  cod?: boolean;
  /** Declared value in rupees (used for the COD percentage). */
  declaredValue?: number;
}

export interface RateBreakdownLine {
  label: string;
  /** Amount in rupees. */
  amount: number;
  hint?: string;
}

export interface RateResult {
  zone: string;
  zoneLabel: string;
  service: ServiceLevel;
  serviceLabel: string;
  chargeableWeightGrams: number;
  volumetricWeightGrams: number;
  /** [min, max] delivery estimate in days. */
  etaDays: [number, number];
  currency: "INR";
  breakdown: RateBreakdownLine[];
  /** Grand total in rupees. */
  total: number;
  /** Grand total in integer paise (exact, no float rounding). */
  totalPaise: number;
  origin: { pincode: string; city: string; state: string };
  destination: { pincode: string; city: string; state: string };
  serviceable: boolean;
}

// ── Serviceability & pincodes ────────────────────────────────────────────────

export interface Serviceability {
  pincode: string;
  serviceable: boolean;
  found: boolean;
  city: string | null;
  state: string | null;
}

export interface PincodeNearby {
  pincode: string;
  city: string | null;
  is_metro: boolean;
}

export interface Pincode {
  pincode: string;
  office_name: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  state_code: string | null;
  state_slug: string | null;
  district_slug: string | null;
  is_metro: boolean;
  is_remote: boolean;
  serviceable: boolean;
  nearby: PincodeNearby[];
}

export interface StateSummary {
  state: string;
  slug: string;
  count: number;
  metros: number;
}

// ── Plans ────────────────────────────────────────────────────────────────────

export interface Plan {
  code: string;
  name: string;
  description: string | null;
  price_monthly_paise: number;
  price_yearly_paise: number;
  /** -1 = unlimited. */
  included_calls: number;
  overage_per_1k_paise: number | null;
  rate_limit: { rpm: number; rpd: number; burst: number } | null;
  max_api_keys: number | null;
  max_team_members: number | null;
  features: unknown;
  sort_order: number;
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

/** Event types Postpin can deliver to a subscribed endpoint. */
export type WebhookEventType =
  | "rate.calculated"
  | "key.created"
  | "key.revoked"
  | "subscription.updated"
  | "invoice.paid"
  | "sync.completed"
  | "sync.failed";

export interface WebhookEvent<T = unknown> {
  id: string;
  event: WebhookEventType | string;
  created: string;
  data: T;
}
