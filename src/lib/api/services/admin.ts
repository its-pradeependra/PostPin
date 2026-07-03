import { apiFetch } from "@/lib/api/client";

/* ── Overview (dashboard) ─────────────────────────────────────────── */

export interface AdminMetric {
  key: string;
  label: string;
  icon: string;
  format: "currency" | "number" | "compact";
  value: number;
  delta_pct: number;
  spark: number[];
}

export interface AdminAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  icon: string;
  title: string;
  meta: string;
  href: string;
  action: string;
}

export interface AdminActivityRow {
  id: string;
  actor: string;
  actor_role: string;
  action: string;
  target: string;
  severity: "info" | "notice" | "warning" | "critical";
  at: string;
}

export interface AdminOverview {
  metrics: AdminMetric[];
  revenue_series: Array<{ month: string; mrr: number }>;
  api_volume: Array<{ date: string; calls: number }>;
  revenue_30d: number;
  tenants_total: number;
  sync: {
    total: number;
    status: "synced" | "syncing" | "failed";
    last_sync_at: string | null;
    added_today: number;
    updated_today: number;
    removed_today: number;
    source: string;
    schedule: string;
  };
  alerts: AdminAlert[];
  activity: AdminActivityRow[];
}

export function getAdminOverview() {
  return apiFetch<AdminOverview>("/admin/overview");
}

/* ── Usage report ─────────────────────────────────────────────────── */

export interface AdminUsageReport {
  summary: { calls: number; failed: number; blocked: number; blocked_pct: number; avg_latency_ms: number; p99_latency_ms: number };
  series: Array<{ date: string; calls: number; failed: number; avg_latency_ms: number }>;
  endpoints: Array<{ endpoint: string; calls: number; success_rate: number; avg_latency_ms: number }>;
  top_consumers: Array<{
    company_id: string;
    company_name: string;
    company_status: string;
    plan_code: string;
    calls: number;
    pct_of_total: number;
    quota_pct: number;
  }>;
}

export function getAdminUsageReport(days: number) {
  return apiFetch<AdminUsageReport>(`/admin/usage-report?days=${days}`);
}

/* ── Tenant directory ─────────────────────────────────────────────── */

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: "pending" | "active" | "suspended" | "closed";
  owner_name: string;
  owner_email: string;
  plan: string;
  mrr: number;
  calls_30d: number;
  monthly_quota: number;
  api_keys: number;
  joined_at: string;
}

export interface TenantList {
  total: number;
  tenants: TenantRow[];
}

export function listTenants(params: { q?: string; plan?: string; status?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.plan) qs.set("plan", params.plan);
  if (params.status) qs.set("status", params.status);
  qs.set("limit", String(params.limit ?? 12));
  qs.set("offset", String(params.offset ?? 0));
  return apiFetch<TenantList>(`/admin/tenants?${qs.toString()}`);
}

export interface TenantDetail {
  company: {
    id: string;
    name: string;
    slug: string;
    status: string;
    billing_email: string | null;
    onboarding_step: string;
    created_at: string;
  };
  owner: { id: string; name: string; email: string; status: string; last_login_at: string | null } | null;
  subscription: {
    plan: string;
    status: string;
    mrr: number;
    interval: string;
    current_period_end: string;
    calls_used: number;
    included_calls: number;
    quota_pct: number;
  } | null;
  usage: { calls_30d: number; series: Array<{ date: string; calls: number }> };
  keys: Array<{ id: string; name: string; masked: string; mode: "live" | "test"; status: string; last_used_at: string | null }>;
  invoices: Array<{ id: string; number: string; plan: string; amount: number; status: string; issued_at: string }>;
  activity: Array<{ id: string; action: string; detail: string; severity: string; at: string }>;
}

export function getTenantDetail(id: string) {
  return apiFetch<TenantDetail>(`/admin/tenants/${id}`);
}

export function suspendTenant(id: string) {
  return apiFetch<{ ok: boolean; status: string }>(`/admin/tenants/${id}/suspend`, { method: "POST" });
}

export function activateTenant(id: string) {
  return apiFetch<{ ok: boolean; status: string }>(`/admin/tenants/${id}/activate`, { method: "POST" });
}

/* ── Audit logs ───────────────────────────────────────────────────── */

export interface AdminAuditLog {
  id: string;
  at: string;
  actor: string;
  actor_role: string;
  action: string;
  category: string;
  target: string;
  outcome: string;
  severity: "info" | "notice" | "warning" | "critical";
  ip: string | null;
}

export function listAdminAuditLogs(params: { limit?: number; offset?: number; category?: string; severity?: string; q?: string } = {}) {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 50));
  qs.set("offset", String(params.offset ?? 0));
  if (params.category) qs.set("category", params.category);
  if (params.severity) qs.set("severity", params.severity);
  if (params.q) qs.set("q", params.q);
  return apiFetch<{ total: number; logs: AdminAuditLog[] }>(`/admin/audit-logs?${qs.toString()}`);
}

/* ── Support queue ────────────────────────────────────────────────── */

export interface AdminTicketRow {
  id: string;
  subject: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "pending" | "on_hold" | "resolved" | "closed";
  createdAt: string;
  updatedAt: string;
  requester: { name: string; email: string; company: string };
  assignee: { id: string; name: string } | null;
  replyCount: number;
  sla: { label: string; variant: "success" | "warning" | "destructive" | "muted"; breached: boolean };
}

export interface AdminTicketMessage {
  id: string;
  author: string;
  authorRole: "customer" | "agent";
  body: string;
  createdAt: string;
  internal: boolean;
}

export interface AdminTicketDetail extends Omit<AdminTicketRow, "replyCount"> {
  messages: AdminTicketMessage[];
}

export function listAdminTickets(params: { status?: string; priority?: string; q?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.priority) qs.set("priority", params.priority);
  if (params.q) qs.set("q", params.q);
  const s = qs.toString();
  return apiFetch<{ tickets: AdminTicketRow[] }>(`/admin/tickets${s ? `?${s}` : ""}`).then((r) => r.tickets);
}

export function getAdminTicket(number: string) {
  return apiFetch<{ ticket: AdminTicketDetail }>(`/admin/tickets/${encodeURIComponent(number)}`).then((r) => r.ticket);
}

export function adminReplyTicket(number: string, body: string, isInternal: boolean) {
  return apiFetch<{ message: AdminTicketMessage }>(`/admin/tickets/${encodeURIComponent(number)}/replies`, {
    method: "POST",
    body: { body, is_internal: isInternal },
  });
}

export function adminUpdateTicket(
  number: string,
  patch: { status?: string; priority?: string; assignee_id?: string | null },
) {
  return apiFetch<{ ticket: AdminTicketDetail }>(`/admin/tickets/${encodeURIComponent(number)}`, { method: "PATCH", body: patch });
}

export function listAdminStaff() {
  return apiFetch<{ staff: Array<{ id: string; name: string; email: string; status: string; last_login_at: string | null }> }>(
    "/admin/staff",
  ).then((r) => r.staff);
}

/* ── Plans CRUD (M6b) ─────────────────────────────────────────────── */

export interface AdminPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  included_calls: number;
  overage_per_1k: number | null;
  rate_limit_rpm: number;
  max_api_keys: number;
  max_team_members: number;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  features: string[];
  active_subscribers: number;
}

export function listAdminPlans() {
  return apiFetch<{ plans: AdminPlan[] }>("/admin/plans").then((r) => r.plans);
}

export function updateAdminPlan(code: string, patch: Partial<Omit<AdminPlan, "id" | "code" | "sort_order" | "active_subscribers">>) {
  return apiFetch<{ plan: AdminPlan }>(`/admin/plans/${code}`, { method: "PATCH", body: patch }).then((r) => r.plan);
}

export type CreatePlanInput = Partial<Omit<AdminPlan, "id" | "active_subscribers">> & { code: string };

export function createAdminPlan(input: CreatePlanInput) {
  return apiFetch<{ plan: AdminPlan }>("/admin/plans", { method: "POST", body: input }).then((r) => r.plan);
}

/* ── Coupons CRUD (M6b) ───────────────────────────────────────────── */

export interface AdminCoupon {
  id: string;
  code: string;
  discount_type: "percent" | "flat" | "free_months";
  value: number;
  applies_to_plan_codes: string[];
  redemption_count: number;
  max_redemptions: number | null;
  valid_from: string | null;
  valid_until: string | null;
  status: "active" | "paused" | "expired";
  created_at: string;
}

export function listAdminCoupons() {
  return apiFetch<{ coupons: AdminCoupon[] }>("/admin/coupons").then((r) => r.coupons);
}

export function createAdminCoupon(input: {
  code: string;
  discount_type: "percent" | "flat" | "free_months";
  value: number;
  applies_to_plan_codes?: string[];
  max_redemptions?: number | null;
  valid_until?: string | null;
}) {
  return apiFetch<{ coupon: AdminCoupon }>("/admin/coupons", { method: "POST", body: input }).then((r) => r.coupon);
}

export function updateAdminCoupon(id: string, patch: { status?: "active" | "paused"; max_redemptions?: number | null; valid_until?: string | null }) {
  return apiFetch<{ coupon: AdminCoupon }>(`/admin/coupons/${id}`, { method: "PATCH", body: patch }).then((r) => r.coupon);
}

/* ── Platform billing (M6b) ───────────────────────────────────────── */

export interface AdminBillingSummary {
  mrr: number;
  paying_tenants: number;
  arpu: number;
  collected_30d: number;
  collected_30d_count: number;
  refunded_30d: number;
  past_due_count: number;
  past_due_amount: number;
  plan_mix: Array<{ plan: string; tenants: number }>;
}

export function getAdminBillingSummary() {
  return apiFetch<AdminBillingSummary>("/admin/billing/summary");
}

export interface AdminInvoiceRow {
  id: string;
  number: string;
  company_id: string;
  company_name: string;
  plan: string;
  amount: number;
  status: "draft" | "open" | "paid" | "void" | "past_due" | "refunded";
  issued_at: string;
  paid_at: string | null;
  razorpay_payment_id: string | null;
}

export function listAdminInvoices(params: { status?: string; q?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  qs.set("limit", String(params.limit ?? 25));
  qs.set("offset", String(params.offset ?? 0));
  return apiFetch<{ total: number; invoices: AdminInvoiceRow[] }>(`/admin/billing/invoices?${qs.toString()}`);
}

export function adminRefundInvoice(invoiceId: string) {
  return apiFetch<{ ok: boolean; refund_id: string | null }>(`/billing/invoices/${invoiceId}/refund`, { method: "POST" });
}

/* ── Pincode master (M6c) ─────────────────────────────────────────── */

export interface PincodeStats {
  total: number;
  metros: number;
  remote: number;
  states: number;
  last_sync: {
    id: string;
    status: string;
    trigger: string;
    started_at: string;
    counts: { scanned: number; added: number; updated: number; removed: number; failed: number };
  } | null;
}

export function getPincodeStats() {
  return apiFetch<PincodeStats>("/admin/pincodes/stats");
}

export interface PincodeRow {
  pincode: string;
  office_name: string;
  district: string;
  state: string;
  city: string;
  is_metro: boolean;
  is_remote: boolean;
  serviceable: boolean;
  source: string;
  updated_at: string;
}

export function searchPincodes(q: string, limit = 20) {
  return apiFetch<{ pincodes: PincodeRow[] }>(`/admin/pincodes/search?q=${encodeURIComponent(q)}&limit=${limit}`).then((r) => r.pincodes);
}

/** Kick off the live data.gov.in directory sync (fire-and-forget; poll status/logs). */
export function runLivePincodeSync() {
  return apiFetch<{ started: boolean }>("/admin/pincodes/sync", { method: "POST" });
}

export interface PincodeSyncStatus {
  running: boolean;
  current: { id: string; trigger: string; source: string; started_at: string } | null;
  last: {
    id: string;
    trigger: string;
    status: "success" | "failed" | "rolled_back";
    started_at: string;
    ended_at: string | null;
    duration_ms: number;
    counts: { scanned: number; added: number; updated: number; removed: number; failed: number };
    error: string | null;
  } | null;
}

/** Durable, server-side sync status — poll while a run is in progress. */
export function getPincodeSyncStatus() {
  return apiFetch<PincodeSyncStatus>("/admin/pincodes/sync/status");
}

export function importPincodesCsv(csv: string) {
  return apiFetch<{
    sync_id: string;
    counts: { scanned: number; added: number; updated: number; removed: number; failed: number };
    failed_records: Array<{ line: number; reason: string }>;
  }>("/admin/pincodes/import", { method: "POST", body: { csv } });
}

export interface SyncLogRow {
  id: string;
  trigger: string;
  source: string;
  status: "running" | "success" | "failed" | "rolled_back";
  started_at: string;
  ended_at: string | null;
  duration_ms: number;
  counts: { scanned: number; added: number; updated: number; removed: number; failed: number };
  error: string | null;
}

export function listSyncLogs(limit = 25) {
  return apiFetch<{ logs: SyncLogRow[] }>(`/admin/pincodes/sync-logs?limit=${limit}`).then((r) => r.logs);
}

export function getSyncSettings() {
  return apiFetch<{ settings: Record<string, unknown> }>("/admin/pincodes/sync-settings").then((r) => r.settings);
}

export function updateSyncSettings(patch: Record<string, unknown>) {
  return apiFetch<{ settings: Record<string, unknown> }>("/admin/pincodes/sync-settings", { method: "PATCH", body: patch }).then((r) => r.settings);
}

/* ── Zones (M6c) ──────────────────────────────────────────────────── */

export interface AdminZone {
  id: string;
  code: string;
  name: string;
  tier: number;
  description: string;
  priority: number;
  sla_days: { min: number; max: number };
  is_special: boolean;
  is_active: boolean;
  base_charge: number | null;
  per_kg: number | null;
}

export function listAdminZones() {
  return apiFetch<{ zones: AdminZone[] }>("/admin/zones").then((r) => r.zones);
}

export interface ZonePatch {
  name?: string;
  description?: string;
  tier?: number;
  priority?: number;
  sla_min?: number;
  sla_max?: number;
  base_charge?: number; // rupees
  per_kg?: number; // rupees
  is_special?: boolean;
  is_active?: boolean;
}

export function updateAdminZone(code: string, patch: ZonePatch) {
  return apiFetch<{ zone: AdminZone }>(`/admin/zones/${code}`, { method: "PATCH", body: patch }).then((r) => r.zone);
}

/* ── API-key audit (M6c) ──────────────────────────────────────────── */

export interface AdminApiKeyRow {
  id: string;
  name: string;
  masked: string;
  mode: "live" | "test";
  status: "active" | "revoked" | "expired";
  company_id: string;
  company_name: string;
  request_count: number;
  last_used_at: string | null;
  created_at: string;
}

export function listAdminApiKeys(params: { q?: string; status?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  qs.set("limit", String(params.limit ?? 25));
  qs.set("offset", String(params.offset ?? 0));
  return apiFetch<{ total: number; keys: AdminApiKeyRow[] }>(`/admin/api-keys?${qs.toString()}`);
}

export function adminForceRevokeKey(id: string) {
  return apiFetch<{ ok: boolean; status: string }>(`/admin/api-keys/${id}/revoke`, { method: "POST" });
}

/* ── Platform team (M6c) ──────────────────────────────────────────── */

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string;
  role_name: string;
  last_login_at: string | null;
  created_at: string;
}

export function listAdminTeam() {
  return apiFetch<{ staff: StaffRow[]; roles: Array<{ key: string; name: string }> }>("/admin/team");
}

export function updateStaffRole(id: string, role: string) {
  return apiFetch<{ ok: boolean; role: string }>(`/admin/team/${id}/role`, { method: "PATCH", body: { role } });
}

/* ── Platform settings (M6c) ──────────────────────────────────────── */

export interface PlatformSetting {
  key: string;
  value: Record<string, unknown>;
  editable_by: string;
  updated_at: string;
}

export function listPlatformSettings() {
  return apiFetch<{ settings: PlatformSetting[] }>("/admin/settings").then((r) => r.settings);
}

export function updatePlatformSetting(key: string, value: Record<string, unknown>) {
  return apiFetch<{ key: string; value: Record<string, unknown> }>(`/admin/settings/${encodeURIComponent(key)}`, { method: "PATCH", body: value });
}

/* ── Rate-cards overview (M6c, read-only) ─────────────────────────── */

export interface AdminRateCardsOverview {
  standard: Array<{ zone: string; name: string; base_charge: number; per_kg: number; sla_min: number; sla_max: number }>;
  custom: Array<{ id: string; name: string; code: string; status: string; company_id: string; company_name: string; slabs: number; created_at: string }>;
}

export function getAdminRateCards() {
  return apiFetch<AdminRateCardsOverview>("/admin/rate-cards");
}
