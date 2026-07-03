/** Shared domain types for the Postpin UI. */

export type PlanId = "free" | "starter" | "growth" | "scale" | "enterprise";

export type PlanInterval = "monthly" | "yearly";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number; // INR
  priceYearly: number; // INR (per month, billed yearly)
  includedCalls: number;
  overagePer1k: number; // INR per 1000 extra calls
  rateLimitRpm: number; // requests per minute
  features: string[];
  highlight?: boolean;
  badge?: string;
}

export type ApiKeyEnv = "live" | "test";
export type ApiKeyStatus = "active" | "revoked";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  maskedKey: string;
  env: ApiKeyEnv;
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  allowedDomains: string[];
  requests30d: number;
  createdBy: string;
}

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketCategory =
  | "billing"
  | "api"
  | "pincode-data"
  | "account"
  | "feature-request"
  | "other";

export interface TicketMessage {
  id: string;
  author: string;
  authorRole: "customer" | "agent";
  avatar?: string;
  body: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  requester: { name: string; email: string; company?: string };
  assignee: string | null;
  messages: TicketMessage[];
}

export type InvoiceStatus = "paid" | "open" | "void" | "past_due";

export interface Invoice {
  id: string;
  number: string;
  plan: string;
  amount: number;
  status: InvoiceStatus;
  issuedAt: string;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
}

export type UserStatus = "active" | "suspended" | "invited" | "trialing";

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  company: string;
  avatar: string;
  plan: PlanId;
  status: UserStatus;
  joinedAt: string;
  calls30d: number;
  monthlyQuota: number;
  apiKeys: number;
  mrr: number; // INR
  country: string;
}

export type AdminRole = "superadmin" | "support" | "billing" | "readonly";

export interface AdminMember {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: AdminRole;
  status: "active" | "invited" | "suspended";
  lastActiveAt: string;
  twoFactor: boolean;
}

export type PincodeSyncStatus = "synced" | "syncing" | "stale" | "failed";

export interface PincodeRecord {
  pincode: string;
  officeName: string;
  district: string;
  state: string;
  region: string;
  circle: string;
  zone: ShippingZone;
  metro: boolean;
  source: "India Post API";
  updatedAt: string;
}

export interface SyncRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: PincodeSyncStatus;
  recordsScanned: number;
  recordsAdded: number;
  recordsUpdated: number;
  durationMs: number;
  trigger: "scheduled" | "manual" | "webhook";
}

export interface Promotion {
  id: string;
  code: string;
  type: "percent" | "flat" | "trial" | "upgrade";
  value: number;
  status: "active" | "scheduled" | "expired" | "disabled";
  redemptions: number;
  maxRedemptions: number | null;
  appliesTo: PlanId[] | "all";
  startsAt: string;
  expiresAt: string | null;
}

// ── Shipping engine ───────────────────────────────────────────────
export type ShippingZone = "local" | "regional" | "metro" | "national" | "special";
export type ServiceLevel = "surface" | "express" | "same_day";

export interface RateRequest {
  origin: string;
  destination: string;
  weightGrams: number;
  length?: number;
  width?: number;
  height?: number;
  service: ServiceLevel;
  cod: boolean;
  declaredValue?: number;
}

export interface RateBreakdownLine {
  label: string;
  amount: number;
  hint?: string;
}

export interface RateResult {
  zone: ShippingZone;
  zoneLabel: string;
  service: ServiceLevel;
  serviceLabel: string;
  chargeableWeightGrams: number;
  volumetricWeightGrams: number;
  etaDays: [number, number];
  currency: "INR";
  breakdown: RateBreakdownLine[];
  total: number;
  origin: { pincode: string; city: string; state: string };
  destination: { pincode: string; city: string; state: string };
  serviceable: boolean;
}

// ── Analytics view models ─────────────────────────────────────────
export interface UsagePoint {
  date: string;
  calls: number;
  success: number;
  failed: number;
  blocked: number;
  avgLatency: number;
}

export interface EndpointStat {
  endpoint: string;
  calls: number;
  successRate: number;
  avgLatency: number;
}

export interface StatusSlice {
  label: string;
  value: number;
  color: string;
}

export interface RecentCall {
  id: string;
  endpoint: string;
  method: string;
  status: number;
  latencyMs: number;
  keyName: string;
  origin: string;
  destination: string;
  zone: ShippingZone;
  cached: boolean;
  at: string;
}

// ── Rate cards & zones ────────────────────────────────────────────
export interface RateSlab {
  upToGrams: number | null; // null = "and above"
  price: number;
}

export interface RateCardZoneRow {
  zone: ShippingZone;
  zoneLabel: string;
  slabs: RateSlab[];
  extraPer500g: number;
}

export interface RateCard {
  id: string;
  name: string;
  assignedTo: string; // "Default" or company name
  status: "published" | "draft";
  currency: "INR";
  codFlat: number;
  codPercent: number;
  fuelPercent: number;
  gstPercent: number;
  rows: RateCardZoneRow[];
  effectiveFrom: string;
  updatedAt: string;
}

export interface ZoneDef {
  id: ShippingZone;
  label: string;
  description: string;
  states: string[];
  metro: boolean;
  remote: boolean;
  etaDays: [number, number];
  pincodeCount: number;
}

// ── Webhooks ──────────────────────────────────────────────────────
export type WebhookEvent =
  | "rate.calculated"
  | "key.created"
  | "key.revoked"
  | "subscription.updated"
  | "invoice.paid"
  | "sync.completed"
  | "sync.failed";

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  status: "active" | "disabled";
  secret: string;
  createdAt: string;
  lastDeliveryAt: string | null;
  successRate: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  status: number;
  ok: boolean;
  durationMs: number;
  attempt: number;
  at: string;
}

// ── Notifications & audit ─────────────────────────────────────────
export type NotificationKind = "usage" | "billing" | "key" | "sync" | "ticket" | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  at: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  actorRole: AdminRole | "customer";
  action: string;
  target: string;
  ip: string;
  at: string;
  severity: "info" | "warning" | "critical";
}

// ── Admin dashboard KPIs ──────────────────────────────────────────
export interface AdminMetric {
  label: string;
  value: string;
  deltaPct: number;
  icon: string;
  spark: number[];
}
