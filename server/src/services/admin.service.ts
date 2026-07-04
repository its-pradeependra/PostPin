import { Types } from "mongoose";
import { getContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import {
  ApiKeyModel,
  ApiLogModel,
  AuditLogModel,
  CompanyModel,
  CouponModel,
  InvoiceModel,
  PincodeModel,
  PincodeSyncLogModel,
  PlanModel,
  SessionModel,
  SettingsModel,
  SubscriptionModel,
  TicketModel,
  UserModel,
} from "@/models/index.js";
import { adminRepo } from "@/tenancy/admin-repo.js";
import { writeAudit } from "@/services/audit.service.js";
import { createNotification } from "@/services/notification.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const rupees = (paise: number) => Math.round(paise) / 100;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Last-N-days date buckets (oldest → newest). */
function dayBuckets(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) out.push(dayKey(new Date(today.getTime() - i * DAY_MS)));
  return out;
}

async function dailyCounts(
  model: typeof ApiLogModel | typeof CompanyModel | typeof TicketModel | typeof InvoiceModel,
  dateField: string,
  days: number,
  match: Record<string, unknown> = {},
  sumField?: string,
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` } },
        n: sumField ? { $sum: `$${sumField}` } : { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r: { _id: string; n: number }) => [r._id, r.n]));
}

const spark = (byDay: Map<string, number>, days = 7) => dayBuckets(days).map((d) => byDay.get(d) ?? 0);

function deltaPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// ── Platform overview (admin dashboard) ─────────────────────────────────────

export async function overview() {
  const now = Date.now();
  const d30 = new Date(now - 30 * DAY_MS);
  const d60 = new Date(now - 60 * DAY_MS);

  const [
    activeSubs,
    tenantsTotal,
    tenantsActive,
    signups30,
    signupsPrev30,
    calls30,
    callsPrev30,
    openTickets,
    pincodeTotal,
    callsByDay,
    signupsByDay,
    ticketsByDay,
    revenueByDay,
    latestSync,
    pastDue,
    urgentOpen,
    syncSetting,
    activity,
  ] = await Promise.all([
    SubscriptionModel.find({ status: "active" }).select("priceSnapshotPaise planCode companyId").lean(),
    CompanyModel.countDocuments({ deletedAt: null }),
    CompanyModel.countDocuments({ status: "active", deletedAt: null }),
    CompanyModel.countDocuments({ createdAt: { $gte: d30 }, deletedAt: null }),
    CompanyModel.countDocuments({ createdAt: { $gte: d60, $lt: d30 }, deletedAt: null }),
    ApiLogModel.countDocuments({ createdAt: { $gte: d30 } }),
    ApiLogModel.countDocuments({ createdAt: { $gte: d60, $lt: d30 } }),
    TicketModel.countDocuments({ status: { $in: ["open", "pending"] }, isDeleted: false }),
    PincodeModel.countDocuments({}),
    dailyCounts(ApiLogModel, "createdAt", 30),
    dailyCounts(CompanyModel, "createdAt", 7),
    dailyCounts(TicketModel, "createdAt", 7),
    // 30-day window: feeds revenue_30d; spark() only reads the last 7 buckets.
    dailyCounts(InvoiceModel, "paidAt", 30, { status: "paid" }, "totalPaise"),
    PincodeSyncLogModel.findOne().sort({ startedAt: -1 }).lean(),
    InvoiceModel.aggregate([
      { $match: { status: "past_due" } },
      { $group: { _id: null, n: { $sum: 1 }, totalPaise: { $sum: "$totalPaise" } } },
    ]),
    TicketModel.countDocuments({ status: { $in: ["open", "pending"] }, priority: "urgent", isDeleted: false }),
    SettingsModel.findOne({ scope: "platform", key: "pincode.sync" }).lean(),
    // The activity feed is audit-log content — only roles holding audit:read may
    // see it here (the dedicated /audit-logs route enforces the same boundary).
    getContext().permissions.has("audit:read")
      ? AuditLogModel.find().sort({ at: -1 }).limit(6).lean()
      : Promise.resolve([]),
  ]);

  const mrrPaise = activeSubs.reduce((a, s) => a + (s.priceSnapshotPaise ?? 0), 0);
  const revenue30 = [...revenueByDay.values()].reduce((a, b) => a + b, 0);

  const metrics = [
    { key: "mrr", label: "MRR", icon: "billing", format: "currency", value: rupees(mrrPaise), delta_pct: 0, spark: spark(revenueByDay).map(rupees) },
    { key: "tenants", label: "Active tenants", icon: "users", format: "number", value: tenantsActive, delta_pct: deltaPct(signups30, signupsPrev30), spark: spark(signupsByDay) },
    { key: "calls", label: "API calls (30d)", icon: "activity", format: "compact", value: calls30, delta_pct: deltaPct(calls30, callsPrev30), spark: spark(callsByDay) },
    { key: "tickets", label: "Open tickets", icon: "ticket", format: "number", value: openTickets, delta_pct: 0, spark: spark(ticketsByDay) },
    { key: "pincodes", label: "Pincodes", icon: "pin", format: "compact", value: pincodeTotal, delta_pct: 0, spark: Array(7).fill(pincodeTotal) },
    { key: "signups", label: "New signups (30d)", icon: "rocket", format: "number", value: signups30, delta_pct: deltaPct(signups30, signupsPrev30), spark: spark(signupsByDay) },
  ];

  // 12-month collected revenue (from PAID invoices — real money, not projections).
  const revenueRows = await InvoiceModel.aggregate([
    { $match: { status: "paid", paidAt: { $gte: new Date(now - 365 * DAY_MS) } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$paidAt" } },
        totalPaise: { $sum: "$totalPaise" },
      },
    },
  ]);
  const revByMonth = new Map(revenueRows.map((r: { _id: string; totalPaise: number }) => [r._id, r.totalPaise]));
  const revenue_series: Array<{ month: string; mrr: number }> = [];
  // Anchor to day 1 in UTC — setMonth() on day-29/30/31 skips or duplicates
  // months, and UTC keeps keys aligned with Mongo's $dateToString buckets.
  const base = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    const k = d.toISOString().slice(0, 7);
    revenue_series.push({
      month: d.toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
      mrr: rupees(revByMonth.get(k) ?? 0),
    });
  }

  const api_volume = dayBuckets(30).map((d) => ({ date: d, calls: callsByDay.get(d) ?? 0 }));

  // Sync health — from the real pincode collection + latest sync run + settings.
  const syncValue = (syncSetting?.value ?? {}) as Record<string, unknown>;
  const sync = {
    total: pincodeTotal,
    status: latestSync ? (latestSync.status === "success" ? "synced" : latestSync.status === "running" ? "syncing" : "failed") : "synced",
    last_sync_at: latestSync?.endedAt ?? latestSync?.startedAt ?? null,
    added_today: latestSync && latestSync.startedAt >= new Date(new Date().setHours(0, 0, 0, 0)) ? latestSync.counts?.added ?? 0 : 0,
    updated_today: latestSync && latestSync.startedAt >= new Date(new Date().setHours(0, 0, 0, 0)) ? latestSync.counts?.updated ?? 0 : 0,
    removed_today: latestSync && latestSync.startedAt >= new Date(new Date().setHours(0, 0, 0, 0)) ? latestSync.counts?.removed ?? 0 : 0,
    source: String(syncValue.source ?? "manual CSV import"),
    schedule: String(syncValue.schedule ?? "manual"),
  };

  // Real, derived alerts — empty array when everything is healthy.
  const alerts: Array<{ id: string; severity: "critical" | "warning" | "info"; icon: string; title: string; meta: string; href: string; action: string }> = [];
  if (latestSync?.status === "failed") {
    alerts.push({ id: "sync-failed", severity: "critical", icon: "sync", title: "Pincode sync failed", meta: latestSync.error ?? "Last import did not complete", href: "/admin/pincodes/sync-logs", action: "View logs" });
  }
  const pd = pastDue[0] as { n: number; totalPaise: number } | undefined;
  if (pd && pd.n > 0) {
    alerts.push({ id: "past-due", severity: "warning", icon: "wallet", title: `${pd.n} payment failure${pd.n === 1 ? "" : "s"}`, meta: `₹${rupees(pd.totalPaise).toLocaleString("en-IN")} outstanding`, href: "/admin/billing", action: "Open invoices" });
  }
  if (urgentOpen > 0) {
    alerts.push({ id: "urgent-tickets", severity: "info", icon: "ticket", title: `${urgentOpen} urgent ticket${urgentOpen === 1 ? "" : "s"} open`, meta: `${openTickets} open in total`, href: "/admin/tickets", action: "Inspect queue" });
  }

  const activityDto = activity.map((l) => ({
    id: String(l._id),
    actor: l.actorEmail ?? (l.actorType === "system" ? "System" : "Unknown"),
    actor_role: l.actorType,
    action: l.action,
    target: l.resource?.name ?? l.resource?.kind ?? "—",
    severity: l.severity,
    at: l.at,
  }));

  return { metrics, revenue_series, api_volume, revenue_30d: rupees(revenue30), tenants_total: tenantsTotal, sync, alerts, activity: activityDto };
}

// ── Platform usage report ────────────────────────────────────────────────────

export async function usageReport(days: number) {
  const since = new Date(Date.now() - days * DAY_MS);
  const [summaryRows, seriesRows, endpointRows, consumerRows] = await Promise.all([
    ApiLogModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          calls: { $sum: 1 },
          failed: { $sum: { $cond: [{ $gte: ["$statusCode", 500] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ["$statusCode", 429] }, 1, 0] } },
          avg: { $avg: "$latencyMs" },
          // $percentile is Mongo 7+; mongoose's accumulator types lag behind it.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          p99: { $percentile: { input: "$latencyMs", p: [0.99], method: "approximate" } } as any,
        },
      },
    ]),
    ApiLogModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          calls: { $sum: 1 },
          // 5xx only — same definition as summary.failed (429s are `blocked`).
          failed: { $sum: { $cond: [{ $gte: ["$statusCode", 500] }, 1, 0] } },
          avg: { $avg: "$latencyMs" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    ApiLogModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$endpoint",
          calls: { $sum: 1 },
          ok: { $sum: { $cond: [{ $lt: ["$statusCode", 400] }, 1, 0] } },
          avg: { $avg: "$latencyMs" },
        },
      },
      { $sort: { calls: -1 } },
      { $limit: 20 },
    ]),
    ApiLogModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$companyId", calls: { $sum: 1 } } },
      { $sort: { calls: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const s = summaryRows[0] as { calls: number; failed: number; blocked: number; avg: number; p99: number[] } | undefined;
  const totalCalls = s?.calls ?? 0;

  // Join top consumers with company + subscription for name/plan/quota.
  const companyIds = consumerRows.map((r: { _id: Types.ObjectId }) => r._id).filter(Boolean);
  const [companies, subs] = await Promise.all([
    CompanyModel.find({ _id: { $in: companyIds } }).select("name status").lean(),
    SubscriptionModel.find({ companyId: { $in: companyIds }, status: "active" }).select("companyId planCode usage currentPeriodStart").lean(),
  ]);
  const companyById = new Map(companies.map((c) => [String(c._id), c]));
  const subByCompany = new Map(subs.map((x) => [String(x.companyId), x]));
  // Honest per-tenant quota usage: billable calls in each sub's CURRENT period
  // from apiLogs (sub.usage.callsUsed is a dead zero — Redis holds the counter).
  const periodUsed = new Map<string, number>(
    await Promise.all(
      subs.map(async (x) => {
        const n = x.currentPeriodStart
          ? await ApiLogModel.countDocuments({ companyId: x.companyId, billable: true, createdAt: { $gte: x.currentPeriodStart } })
          : 0;
        return [String(x.companyId), n] as [string, number];
      }),
    ),
  );

  return {
    summary: {
      calls: totalCalls,
      failed: s?.failed ?? 0,
      blocked: s?.blocked ?? 0,
      blocked_pct: totalCalls ? Math.round(((s?.blocked ?? 0) / totalCalls) * 1000) / 10 : 0,
      avg_latency_ms: Math.round(s?.avg ?? 0),
      p99_latency_ms: Math.round(s?.p99?.[0] ?? 0),
    },
    series: (seriesRows as Array<{ _id: string; calls: number; failed: number; avg: number }>).map((r) => ({
      date: r._id,
      calls: r.calls,
      failed: r.failed,
      avg_latency_ms: Math.round(r.avg ?? 0),
    })),
    endpoints: (endpointRows as Array<{ _id: string; calls: number; ok: number; avg: number }>).map((r) => ({
      endpoint: r._id ?? "unknown",
      calls: r.calls,
      success_rate: r.calls ? Math.round((r.ok / r.calls) * 1000) / 1000 : 0,
      avg_latency_ms: Math.round(r.avg ?? 0),
    })),
    top_consumers: (consumerRows as Array<{ _id: Types.ObjectId; calls: number }>).map((r) => {
      const c = companyById.get(String(r._id));
      const sub = subByCompany.get(String(r._id));
      const included = sub?.usage?.includedCalls ?? 0;
      return {
        company_id: String(r._id),
        company_name: c?.name ?? "Unknown",
        company_status: c?.status ?? "unknown",
        plan_code: sub?.planCode ?? "free",
        calls: r.calls,
        pct_of_total: totalCalls ? Math.round((r.calls / totalCalls) * 1000) / 10 : 0,
        quota_pct: included > 0 ? Math.round(((periodUsed.get(String(r._id)) ?? 0) / included) * 1000) / 10 : 0,
      };
    }),
  };
}

// ── Tenant directory ─────────────────────────────────────────────────────────

export async function listTenants(params: { q?: string; plan?: string; status?: string; limit: number; offset: number }) {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (params.status) filter.status = params.status;

  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const owners = await UserModel.find({ $or: [{ email: rx }, { name: rx }], companyId: { $ne: null } })
      .select("companyId")
      .lean();
    filter.$or = [{ name: rx }, { slug: rx }, { _id: { $in: owners.map((o) => o.companyId) } }];
  }
  if (params.plan) {
    const subs = await SubscriptionModel.find({ planCode: params.plan, status: "active" }).select("companyId").lean();
    const planIds = subs.map((s) => s.companyId);
    // Combine with any existing filter (q) — both must hold.
    filter._id = { $in: planIds };
  }

  const [total, companies] = await Promise.all([
    CompanyModel.countDocuments(filter),
    CompanyModel.find(filter).sort({ createdAt: -1 }).skip(params.offset).limit(params.limit).lean(),
  ]);

  const ids = companies.map((c) => c._id);
  const [owners, subs, keyCounts, callCounts] = await Promise.all([
    UserModel.find({ _id: { $in: companies.map((c) => c.ownerUserId).filter(Boolean) } })
      .select("name email")
      .lean(),
    SubscriptionModel.find({ companyId: { $in: ids }, status: "active" }).lean(),
    ApiKeyModel.aggregate([
      { $match: { companyId: { $in: ids }, status: "active" } },
      { $group: { _id: "$companyId", n: { $sum: 1 } } },
    ]),
    ApiLogModel.aggregate([
      { $match: { companyId: { $in: ids }, createdAt: { $gte: new Date(Date.now() - 30 * DAY_MS) } } },
      { $group: { _id: "$companyId", n: { $sum: 1 } } },
    ]),
  ]);
  const ownerById = new Map(owners.map((o) => [String(o._id), o]));
  const subByCompany = new Map(subs.map((s) => [String(s.companyId), s]));
  const keysByCompany = new Map(keyCounts.map((k: { _id: Types.ObjectId; n: number }) => [String(k._id), k.n]));
  const callsByCompany = new Map(callCounts.map((k: { _id: Types.ObjectId; n: number }) => [String(k._id), k.n]));

  return {
    total,
    tenants: companies.map((c) => {
      const owner = c.ownerUserId ? ownerById.get(String(c.ownerUserId)) : null;
      const sub = subByCompany.get(String(c._id));
      return {
        id: String(c._id),
        name: c.name,
        slug: c.slug,
        status: c.status,
        owner_name: owner?.name ?? "—",
        owner_email: owner?.email ?? "—",
        plan: sub?.planCode ?? "free",
        mrr: rupees(sub?.priceSnapshotPaise ?? 0),
        calls_30d: callsByCompany.get(String(c._id)) ?? 0,
        monthly_quota: sub?.usage?.includedCalls ?? 0,
        api_keys: keysByCompany.get(String(c._id)) ?? 0,
        joined_at: c.createdAt,
      };
    }),
  };
}

export async function tenantDetail(id: string) {
  const company = await CompanyModel.findOne({ _id: id, deletedAt: null }).lean();
  if (!company) throw AppError.notFound("Tenant not found");

  // Cross-tenant scoped reads go through adminRepo → audited + tenant.read enforced.
  const [owner, subRaw, keys, invoices, activity, calls30, callsSeries] = await Promise.all([
    company.ownerUserId ? UserModel.findById(company.ownerUserId).select("name email status lastLoginAt").lean() : null,
    adminRepo(SubscriptionModel, id).findOne({ status: "active" }).lean(),
    adminRepo(ApiKeyModel, id).find({}).sort({ createdAt: -1 }).limit(10).lean(),
    adminRepo(InvoiceModel, id).find({}).sort({ createdAt: -1 }).limit(10).lean(),
    AuditLogModel.find({ companyId: id }).sort({ at: -1 }).limit(10).lean(),
    ApiLogModel.countDocuments({ companyId: id, createdAt: { $gte: new Date(Date.now() - 30 * DAY_MS) } }),
    dailyCounts(ApiLogModel, "createdAt", 14, { companyId: new Types.ObjectId(id) }),
  ]);

  // adminRepo is Model<any> → findOne().lean() returns an ambiguous union; assert the doc shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = subRaw as any;
  const included = sub?.usage?.includedCalls ?? 0;
  // Honest usage: count billable calls in the CURRENT period from apiLogs — the
  // sub.usage.callsUsed field is a dead zero (real counting lives in Redis/apiLogs).
  const periodCalls = sub?.currentPeriodStart
    ? await ApiLogModel.countDocuments({ companyId: company._id, billable: true, createdAt: { $gte: sub.currentPeriodStart } })
    : 0;
  return {
    company: {
      id: String(company._id),
      name: company.name,
      slug: company.slug,
      status: company.status,
      billing_email: company.billingEmail ?? null,
      onboarding_step: company.onboardingStep,
      created_at: company.createdAt,
    },
    owner: owner ? { id: String(owner._id), name: owner.name, email: owner.email, status: owner.status, last_login_at: owner.lastLoginAt ?? null } : null,
    subscription: sub
      ? {
          plan: sub.planCode,
          status: sub.status,
          mrr: rupees(sub.priceSnapshotPaise ?? 0),
          interval: sub.interval,
          current_period_end: sub.currentPeriodEnd,
          calls_used: periodCalls,
          included_calls: included,
          quota_pct: included > 0 ? Math.round((periodCalls / included) * 1000) / 10 : 0,
        }
      : null,
    usage: { calls_30d: calls30, series: dayBuckets(14).map((d) => ({ date: d, calls: callsSeries.get(d) ?? 0 })) },
    keys: keys.map((k) => ({
      id: String(k._id),
      name: k.name,
      masked: `${k.prefix}…${k.last4}`,
      mode: k.mode,
      status: k.status,
      last_used_at: k.lastUsedAt ?? null,
    })),
    invoices: invoices.map((i) => ({
      id: String(i._id),
      number: i.number,
      plan: i.planCode,
      amount: rupees(i.totalPaise),
      status: i.status,
      issued_at: i.issuedAt,
    })),
    activity: activity.map((l) => ({
      id: String(l._id),
      action: l.action,
      detail: l.resource?.name ?? l.resource?.kind ?? "",
      severity: l.severity,
      at: l.at,
    })),
  };
}

export async function setTenantStatus(id: string, action: "suspend" | "activate") {
  const ctx = getContext();
  const company = await CompanyModel.findOne({ _id: id, deletedAt: null });
  if (!company) throw AppError.notFound("Tenant not found");
  const nextStatus = action === "suspend" ? "suspended" : "active";
  if (company.status === nextStatus) return { ok: true, status: company.status };

  company.status = nextStatus;
  await company.save();

  if (action === "suspend") {
    // Make the suspension bite IMMEDIATELY: kill refresh sessions and invalidate
    // outstanding access tokens (permVersion bump → 401 token_stale on next call).
    const companyId = company._id;
    await Promise.all([
      SessionModel.updateMany({ companyId, revokedAt: null }, { $set: { revokedAt: new Date() } }),
      UserModel.updateMany({ companyId }, { $inc: { permVersion: 1 } }),
    ]);
  }

  await writeAudit({
    action: action === "suspend" ? "tenant.suspended" : "tenant.restored",
    category: "security",
    severity: action === "suspend" ? "warning" : "notice",
    actorId: ctx.userId,
    companyId: company._id,
    resource: { kind: "company", id: String(company._id), name: company.name },
  });
  return { ok: true, status: nextStatus };
}

// ── Audit logs ───────────────────────────────────────────────────────────────

export async function listAuditLogs(params: { limit: number; offset: number; category?: string; severity?: string; q?: string }) {
  const filter: Record<string, unknown> = {};
  if (params.category) filter.category = params.category;
  if (params.severity) filter.severity = params.severity;
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ action: rx }, { actorEmail: rx }, { "resource.name": rx }];
  }
  const [total, rows] = await Promise.all([
    AuditLogModel.countDocuments(filter),
    AuditLogModel.find(filter).sort({ at: -1 }).skip(params.offset).limit(params.limit).lean(),
  ]);
  return {
    total,
    logs: rows.map((l) => ({
      id: String(l._id),
      at: l.at,
      actor: l.actorEmail ?? (l.actorType === "system" ? "System" : "Unknown"),
      actor_role: l.actorType,
      action: l.action,
      category: l.category,
      target: l.resource?.name ?? l.resource?.kind ?? "—",
      outcome: l.outcome,
      severity: l.severity,
      ip: l.ip ?? null,
    })),
  };
}

// ── Platform staff (assignee dropdowns, team page) ──────────────────────────

export async function listStaff() {
  const staff = await UserModel.find({ isPlatformStaff: true }).select("name email status roleId lastLoginAt").lean();
  return {
    staff: staff.map((u) => ({ id: String(u._id), name: u.name, email: u.email, status: u.status, last_login_at: u.lastLoginAt ?? null })),
  };
}

// Referenced so the import stays purposeful: plans power tenant-detail joins later.
export async function listPlansLite() {
  const plans = await PlanModel.find({ isActive: true }).select("code name").sort({ sortOrder: 1 }).lean();
  return { plans: plans.map((p) => ({ code: p.code, name: p.name })) };
}

// ── M6b: Plans CRUD (plan:write) ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function planAdminDto(p: any, subscribers = 0) {
  return {
    id: String(p._id),
    code: p.code,
    name: p.name,
    description: p.description ?? "",
    price_monthly: rupees(p.priceMonthlyPaise ?? 0),
    price_yearly: rupees(p.priceYearlyPaise ?? 0),
    included_calls: p.includedCalls ?? 0,
    overage_per_1k: p.overagePer1kPaise != null ? rupees(p.overagePer1kPaise) : null,
    rate_limit_rpm: p.rateLimit?.rpm ?? 0,
    max_api_keys: p.maxApiKeys ?? 1,
    max_team_members: p.maxTeamMembers ?? 1,
    is_active: Boolean(p.isActive),
    is_public: Boolean(p.isPublic),
    sort_order: p.sortOrder ?? 0,
    features: p.features ?? [],
    active_subscribers: subscribers,
  };
}

export async function adminListPlans() {
  const [plans, subCounts] = await Promise.all([
    PlanModel.find().sort({ sortOrder: 1 }).lean(),
    SubscriptionModel.aggregate([{ $match: { status: "active" } }, { $group: { _id: "$planCode", n: { $sum: 1 } } }]),
  ]);
  const byCode = new Map(subCounts.map((s: { _id: string; n: number }) => [s._id, s.n]));
  return { plans: plans.map((p) => planAdminDto(p, byCode.get(p.code) ?? 0)) };
}

export interface PlanPatch {
  name?: string;
  description?: string;
  price_monthly?: number; // rupees
  price_yearly?: number;
  included_calls?: number;
  overage_per_1k?: number | null;
  rate_limit_rpm?: number;
  max_api_keys?: number;
  max_team_members?: number;
  is_active?: boolean;
  is_public?: boolean;
  features?: string[];
}

export async function adminUpdatePlan(code: string, patch: PlanPatch) {
  const ctx = getContext();
  const plan = await PlanModel.findOne({ code });
  if (!plan) throw AppError.notFound("Plan not found");

  const changes: Array<{ field: string; before?: unknown; after?: unknown }> = [];
  const setNum = (field: string, current: number, next: number | undefined, toPaise = false) => {
    if (next === undefined) return current;
    const v = toPaise ? Math.round(next * 100) : next;
    if (v !== current) changes.push({ field, before: current, after: v });
    return v;
  };

  plan.priceMonthlyPaise = setNum("priceMonthlyPaise", plan.priceMonthlyPaise ?? 0, patch.price_monthly, true);
  plan.priceYearlyPaise = setNum("priceYearlyPaise", plan.priceYearlyPaise ?? 0, patch.price_yearly, true);
  plan.includedCalls = setNum("includedCalls", plan.includedCalls ?? 0, patch.included_calls);
  if (patch.overage_per_1k !== undefined) {
    const v = patch.overage_per_1k === null ? null : Math.round(patch.overage_per_1k * 100);
    if (v !== plan.overagePer1kPaise) changes.push({ field: "overagePer1kPaise", before: plan.overagePer1kPaise, after: v });
    plan.overagePer1kPaise = v;
  }
  if (patch.rate_limit_rpm !== undefined) plan.set("rateLimit.rpm", patch.rate_limit_rpm);
  plan.maxApiKeys = setNum("maxApiKeys", plan.maxApiKeys ?? 1, patch.max_api_keys);
  plan.maxTeamMembers = setNum("maxTeamMembers", plan.maxTeamMembers ?? 1, patch.max_team_members);
  if (patch.name !== undefined && patch.name !== plan.name) {
    changes.push({ field: "name", before: plan.name, after: patch.name });
    plan.name = patch.name;
  }
  if (patch.description !== undefined) plan.description = patch.description;
  if (patch.is_active !== undefined && patch.is_active !== plan.isActive) {
    changes.push({ field: "isActive", before: plan.isActive, after: patch.is_active });
    plan.isActive = patch.is_active;
  }
  if (patch.is_public !== undefined) plan.isPublic = patch.is_public;
  if (patch.features !== undefined) plan.set("features", patch.features);
  await plan.save();

  // NOTE: price edits affect NEW checkouts only — existing subscriptions keep
  // their priceSnapshotPaise until their next plan change (by design).
  await writeAudit({
    action: "plan.updated",
    category: "billing",
    severity: "notice",
    actorId: ctx.userId,
    resource: { kind: "plan", id: String(plan._id), name: plan.code },
    changes,
  });
  const subs = await SubscriptionModel.countDocuments({ planCode: code, status: "active" });
  return { plan: planAdminDto(plan, subs) };
}

export interface PlanInput extends PlanPatch {
  code: string;
  sort_order?: number;
}

export async function adminCreatePlan(input: PlanInput) {
  const ctx = getContext();
  const code = String(input.code ?? "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(code)) {
    throw AppError.badRequest("Plan code must be a lowercase slug (letters, digits, - or _)", "invalid_plan_code");
  }
  const exists = await PlanModel.findOne({ code }).select("_id").lean();
  if (exists) throw AppError.badRequest(`A plan with code "${code}" already exists`, "plan_exists");

  const toPaise = (v: number | undefined, d = 0) => (v === undefined ? d : Math.round(v * 100));
  const plan = await PlanModel.create({
    code,
    version: 1,
    name: input.name?.trim() || code,
    description: input.description ?? "",
    priceMonthlyPaise: toPaise(input.price_monthly),
    priceYearlyPaise: toPaise(input.price_yearly),
    includedCalls: input.included_calls ?? 0,
    overagePer1kPaise: input.overage_per_1k == null ? null : Math.round(input.overage_per_1k * 100),
    rateLimit: { rpm: input.rate_limit_rpm ?? 30, rpd: 0, burst: 10 },
    features: input.features ?? [],
    maxApiKeys: input.max_api_keys ?? 1,
    maxTeamMembers: input.max_team_members ?? 1,
    isActive: input.is_active ?? true,
    isPublic: input.is_public ?? false,
    sortOrder: input.sort_order ?? 100,
  });

  await writeAudit({
    action: "plan.created",
    category: "billing",
    severity: "notice",
    actorId: ctx.userId,
    resource: { kind: "plan", id: String(plan._id), name: plan.code },
    metadata: { code, name: plan.name },
  });
  return { plan: planAdminDto(plan, 0) };
}

// ── M6b: Coupons CRUD (coupon:write) ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function couponAdminDto(c: any) {
  const expired = c.validUntil && new Date(c.validUntil).getTime() < Date.now();
  return {
    id: String(c._id),
    code: c.code,
    discount_type: c.discountType,
    // percent → percentage points; flat → rupees; free_months → months.
    value: c.discountType === "percent" ? (c.value ?? 0) / 100 : c.discountType === "flat" ? rupees(c.value ?? 0) : c.value ?? 0,
    applies_to_plan_codes: c.appliesToPlanCodes ?? [],
    redemption_count: c.redemptionCount ?? 0,
    max_redemptions: c.maxRedemptions ?? null,
    valid_from: c.validFrom ?? null,
    valid_until: c.validUntil ?? null,
    status: expired && c.status === "active" ? "expired" : c.status,
    created_at: c.createdAt,
  };
}

export async function adminListCoupons() {
  const coupons = await CouponModel.find().sort({ createdAt: -1 }).lean();
  return { coupons: coupons.map(couponAdminDto) };
}

export interface CouponInput {
  code: string;
  discount_type: "percent" | "flat" | "free_months";
  value: number; // percent → percentage points; flat → rupees; free_months → months
  applies_to_plan_codes?: string[];
  max_redemptions?: number | null;
  valid_until?: string | null;
}

function couponValueToDb(type: CouponInput["discount_type"], value: number): number {
  if (type === "percent") {
    if (value <= 0 || value > 100) throw AppError.badRequest("Percent discount must be between 1 and 100", "invalid_coupon_value");
    return Math.round(value * 100); // basis points
  }
  if (type === "flat") {
    if (value <= 0) throw AppError.badRequest("Flat discount must be positive", "invalid_coupon_value");
    return Math.round(value * 100); // paise
  }
  if (value < 1 || value > 12) throw AppError.badRequest("Free months must be between 1 and 12", "invalid_coupon_value");
  return Math.round(value);
}

export async function adminCreateCoupon(input: CouponInput) {
  const ctx = getContext();
  const code = input.code.trim().toUpperCase();
  const exists = await CouponModel.findOne({ code });
  if (exists) throw AppError.conflict("A coupon with that code already exists", "coupon_exists");
  const doc = await CouponModel.create({
    code,
    discountType: input.discount_type,
    value: couponValueToDb(input.discount_type, input.value),
    appliesToPlanCodes: input.applies_to_plan_codes ?? [],
    maxRedemptions: input.max_redemptions ?? null,
    validUntil: input.valid_until ? new Date(input.valid_until) : null,
    status: "active",
  });
  await writeAudit({
    action: "coupon.created",
    category: "billing",
    actorId: ctx.userId,
    resource: { kind: "coupon", id: String(doc._id), name: code },
  });
  return { coupon: couponAdminDto(doc) };
}

export async function adminUpdateCoupon(
  id: string,
  patch: { status?: "active" | "paused"; max_redemptions?: number | null; valid_until?: string | null },
) {
  const ctx = getContext();
  const set: Record<string, unknown> = {};
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.max_redemptions !== undefined) set.maxRedemptions = patch.max_redemptions;
  if (patch.valid_until !== undefined) set.validUntil = patch.valid_until ? new Date(patch.valid_until) : null;
  const doc = await CouponModel.findByIdAndUpdate(id, { $set: set }, { new: true });
  if (!doc) throw AppError.notFound("Coupon not found");
  await writeAudit({
    action: "coupon.updated",
    category: "billing",
    actorId: ctx.userId,
    resource: { kind: "coupon", id, name: doc.code },
  });
  return { coupon: couponAdminDto(doc) };
}

// ── M6b: Platform billing (tenant:read / invoice:refund at routes) ──────────

export async function adminBillingSummary() {
  const d30 = new Date(Date.now() - 30 * DAY_MS);
  const [activeSubs, collected30, refunded30, pastDue, payingCount] = await Promise.all([
    SubscriptionModel.find({ status: "active" }).select("priceSnapshotPaise planCode").lean(),
    InvoiceModel.aggregate([
      { $match: { status: "paid", paidAt: { $gte: d30 } } },
      { $group: { _id: null, n: { $sum: 1 }, totalPaise: { $sum: "$totalPaise" } } },
    ]),
    InvoiceModel.aggregate([
      { $match: { status: "refunded", updatedAt: { $gte: d30 } } },
      { $group: { _id: null, n: { $sum: 1 }, totalPaise: { $sum: "$totalPaise" } } },
    ]),
    InvoiceModel.aggregate([{ $match: { status: "past_due" } }, { $group: { _id: null, n: { $sum: 1 }, totalPaise: { $sum: "$totalPaise" } } }]),
    SubscriptionModel.countDocuments({ status: "active", priceSnapshotPaise: { $gt: 0 } }),
  ]);
  const mrrPaise = activeSubs.reduce((a, s) => a + (s.priceSnapshotPaise ?? 0), 0);
  const c30 = collected30[0] as { n: number; totalPaise: number } | undefined;
  const r30 = refunded30[0] as { n: number; totalPaise: number } | undefined;
  const pd = pastDue[0] as { n: number; totalPaise: number } | undefined;
  const byPlan = new Map<string, number>();
  for (const s of activeSubs) byPlan.set(s.planCode, (byPlan.get(s.planCode) ?? 0) + 1);
  return {
    mrr: rupees(mrrPaise),
    paying_tenants: payingCount,
    arpu: payingCount > 0 ? Math.round((mrrPaise / payingCount)) / 100 : 0,
    collected_30d: rupees(c30?.totalPaise ?? 0),
    collected_30d_count: c30?.n ?? 0,
    refunded_30d: rupees(r30?.totalPaise ?? 0),
    past_due_count: pd?.n ?? 0,
    past_due_amount: rupees(pd?.totalPaise ?? 0),
    plan_mix: [...byPlan.entries()].map(([plan, n]) => ({ plan, tenants: n })),
  };
}

export async function adminListInvoices(params: { status?: string; q?: string; limit: number; offset: number }) {
  const filter: Record<string, unknown> = {};
  if (params.status) filter.status = params.status;
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const companies = await CompanyModel.find({ name: rx }).select("_id").lean();
    filter.$or = [{ number: rx }, { companyId: { $in: companies.map((c) => c._id) } }];
  }
  const [total, rows] = await Promise.all([
    InvoiceModel.countDocuments(filter),
    InvoiceModel.find(filter).sort({ createdAt: -1 }).skip(params.offset).limit(params.limit).lean(),
  ]);
  const names = await companyNamesForBilling(rows.map((r) => r.companyId));
  return {
    total,
    invoices: rows.map((i) => ({
      id: String(i._id),
      number: i.number,
      company_id: String(i.companyId),
      company_name: names.get(String(i.companyId)) ?? "Unknown",
      plan: i.planCode,
      amount: rupees(i.totalPaise),
      status: i.status,
      issued_at: i.issuedAt,
      paid_at: i.paidAt ?? null,
      razorpay_payment_id: i.razorpayPaymentId ?? null,
    })),
  };
}

async function companyNamesForBilling(ids: Array<Types.ObjectId>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.map(String))];
  if (uniq.length === 0) return new Map();
  const rows = await CompanyModel.find({ _id: { $in: uniq } }).select("name").lean();
  return new Map(rows.map((c) => [String(c._id), c.name as string]));
}

// ── M6c: Pincode master (pincode:config / pincode:sync) ─────────────────────

export async function pincodeStats() {
  const [total, metros, remote, states, latestLogs] = await Promise.all([
    PincodeModel.countDocuments({ status: "active" }),
    PincodeModel.countDocuments({ status: "active", isMetro: true }),
    PincodeModel.countDocuments({ status: "active", isRemote: true }),
    PincodeModel.distinct("state", { status: "active" }),
    PincodeSyncLogModel.find().sort({ startedAt: -1 }).limit(1).lean(),
  ]);
  const latest = latestLogs[0];
  return {
    total,
    metros,
    remote,
    states: states.filter(Boolean).length,
    last_sync: latest
      ? {
          id: String(latest._id),
          status: latest.status,
          trigger: latest.trigger,
          started_at: latest.startedAt,
          counts: latest.counts ?? { scanned: 0, added: 0, updated: 0, removed: 0, failed: 0 },
        }
      : null,
  };
}

export async function searchPincodes(q: string, limit: number) {
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const filter = /^\d{2,6}$/.test(q)
    ? { pincode: new RegExp("^" + q) }
    : { $or: [{ officeName: rx }, { district: rx }, { state: rx }, { city: rx }] };
  const rows = await PincodeModel.find({ ...filter, status: "active" }).limit(Math.min(limit, 50)).lean();
  return {
    pincodes: rows.map((p) => ({
      pincode: p.pincode,
      office_name: p.officeName ?? "",
      district: p.district ?? "",
      state: p.state ?? "",
      city: p.city ?? "",
      is_metro: Boolean(p.isMetro),
      is_remote: Boolean(p.isRemote),
      serviceable: p.serviceable?.prepaid ?? true,
      source: p.source,
      updated_at: p.updatedAt,
    })),
  };
}

/** Split one CSV line respecting double-quoted fields (RFC-4180 style, incl. "" escapes).
 * Real-world pincode data has commas inside office names. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/** CSV import IS the real sync path (India Post live API is an honest deferral).
 * Expected header: pincode,officeName,district,state,city,isMetro,isRemote.
 * Quoted fields supported; rows are batched into bulkWrite upserts. */
export async function importPincodesCsv(csvText: string) {
  const ctx = getContext();
  const started = Date.now();
  const log = await PincodeSyncLogModel.create({ trigger: "import", source: "csv", status: "running", triggeredByUserId: ctx.userId });

  const fail = async (message: string, code: string) => {
    log.status = "failed";
    log.error = message;
    log.endedAt = new Date();
    await log.save();
    throw AppError.badRequest(message, code);
  };

  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) await fail("CSV has no data rows", "empty_csv");
  const header = lines[0]!.toLowerCase();
  if (!header.includes("pincode")) await fail("First row must be a header including 'pincode'", "bad_csv_header");
  const cols = splitCsvLine(header);
  const idx = (name: string) => cols.indexOf(name);
  const iPin = idx("pincode");

  const counts = { scanned: 0, added: 0, updated: 0, removed: 0, failed: 0 };
  const failedRecords: Array<{ line: number; reason: string }> = [];
  const BATCH = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ops: any[] = [];
  const seenInFile = new Set<string>();

  const flush = async () => {
    if (ops.length === 0) return;
    const res = await PincodeModel.bulkWrite(ops, { ordered: false });
    counts.added += res.upsertedCount ?? 0;
    counts.updated += res.modifiedCount ?? 0;
    ops = [];
  };

  for (let i = 1; i < lines.length; i++) {
    counts.scanned++;
    const parts = splitCsvLine(lines[i]!);
    const pin = parts[iPin] ?? "";
    if (!/^\d{6}$/.test(pin)) {
      counts.failed++;
      if (failedRecords.length < 50) failedRecords.push({ line: i + 1, reason: `invalid pincode "${pin}"` });
      continue;
    }
    if (seenInFile.has(pin)) continue; // one doc per pincode — first row wins, dupes aren't "updates"
    seenInFile.add(pin);

    const doc: Record<string, unknown> = { status: "active", source: "import", lastSyncId: log._id };
    const put = (col: string, field: string, transform?: (v: string) => unknown) => {
      const j = idx(col);
      if (j >= 0 && parts[j] !== undefined && parts[j] !== "") doc[field] = transform ? transform(parts[j]!) : parts[j];
    };
    put("officename", "officeName");
    put("district", "district");
    put("state", "state");
    put("city", "city");
    put("ismetro", "isMetro", (v) => /^(1|true|yes)$/i.test(v));
    put("isremote", "isRemote", (v) => /^(1|true|yes)$/i.test(v));
    put("lat", "lat", (v) => (Number.isFinite(Number(v)) ? Number(v) : null));
    put("lng", "lng", (v) => (Number.isFinite(Number(v)) ? Number(v) : null));
    ops.push({
      updateOne: {
        filter: { pincode: pin },
        update: { $set: doc, $setOnInsert: { pincode: pin } },
        upsert: true,
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();

  log.status = "success";
  log.set("counts", counts);
  log.set("failedRecords", failedRecords);
  log.endedAt = new Date();
  log.durationMs = Date.now() - started;
  await log.save();

  await writeAudit({
    action: "pincode.import",
    category: "pincode",
    severity: counts.failed > 0 ? "warning" : "info",
    actorId: ctx.userId,
    resource: { kind: "pincodeSyncLog", id: String(log._id) },
    metadata: counts,
  });
  return { sync_id: String(log._id), counts, failed_records: failedRecords };
}

export async function listSyncLogs(limit: number) {
  const rows = await PincodeSyncLogModel.find().sort({ startedAt: -1 }).limit(Math.min(limit, 100)).lean();
  return {
    logs: rows.map((l) => ({
      id: String(l._id),
      trigger: l.trigger,
      source: l.source,
      status: l.status,
      started_at: l.startedAt,
      ended_at: l.endedAt ?? null,
      duration_ms: l.durationMs ?? 0,
      counts: l.counts ?? { scanned: 0, added: 0, updated: 0, removed: 0, failed: 0 },
      error: l.error ?? null,
    })),
  };
}

export async function getSyncSettings() {
  const s = await SettingsModel.findOne({ scope: "platform", key: "pincode.sync" }).lean();
  return { settings: (s?.value ?? {}) as Record<string, unknown> };
}

export async function updateSyncSettings(patch: Record<string, unknown>) {
  const ctx = getContext();
  const s = await SettingsModel.findOneAndUpdate(
    { scope: "platform", key: "pincode.sync" },
    { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`value.${k}`, v])) },
    { new: true, upsert: true },
  );
  await writeAudit({
    action: "settings.updated",
    category: "pincode",
    actorId: ctx.userId,
    resource: { kind: "settings", name: "pincode.sync" },
    metadata: patch,
  });
  return { settings: (s.value ?? {}) as Record<string, unknown> };
}

// ── M6c: Zones (read-only real view of the live pricing bands) ──────────────

export async function adminListZones() {
  const { ZONE_PRICING } = await import("@/data/zones.data.js");
  const { ZoneModel } = await import("@/models/index.js");
  const zones = await ZoneModel.find().sort({ tier: 1 }).lean();
  return {
    zones: zones.map((z) => {
      // Effective pricing = zone override, else the built-in seed for that code.
      const fb = ZONE_PRICING[z.code as string];
      const basePaise = (z as { baseChargePaise?: number | null }).baseChargePaise ?? fb?.baseChargePaise ?? null;
      const perKgPaise = (z as { perKgPaise?: number | null }).perKgPaise ?? fb?.perKgPaise ?? null;
      return {
        id: String(z._id),
        code: z.code,
        name: z.name,
        tier: z.tier,
        description: z.description ?? "",
        priority: z.resolution?.priority ?? 100,
        sla_days: { min: z.slaDays?.min ?? 1, max: z.slaDays?.max ?? 5 },
        is_special: Boolean(z.isSpecial),
        is_active: Boolean(z.isActive),
        base_charge: basePaise != null ? rupees(basePaise) : null,
        per_kg: perKgPaise != null ? rupees(perKgPaise) : null,
      };
    }),
  };
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

export async function adminUpdateZone(code: string, patch: ZonePatch) {
  const ctx = getContext();
  const { ZoneModel } = await import("@/models/index.js");
  const { invalidateZonePricing } = await import("@/services/rate-engine.service.js");
  const zone = await ZoneModel.findOne({ code });
  if (!zone) throw AppError.notFound("Zone not found");

  const changes: Array<{ field: string; before?: unknown; after?: unknown }> = [];
  const track = (field: string, before: unknown, after: unknown) => {
    if (before !== after) changes.push({ field, before, after });
  };

  if (patch.name !== undefined) {
    track("name", zone.name, patch.name);
    zone.name = patch.name;
  }
  if (patch.description !== undefined) zone.description = patch.description;
  if (patch.tier !== undefined) {
    track("tier", zone.tier, patch.tier);
    zone.tier = patch.tier;
  }
  if (patch.priority !== undefined) zone.set("resolution.priority", patch.priority);
  if (patch.sla_min !== undefined) zone.set("slaDays.min", patch.sla_min);
  if (patch.sla_max !== undefined) zone.set("slaDays.max", patch.sla_max);
  if (patch.base_charge !== undefined) {
    const v = Math.round(patch.base_charge * 100);
    track("baseChargePaise", (zone as { baseChargePaise?: number | null }).baseChargePaise, v);
    zone.set("baseChargePaise", v);
  }
  if (patch.per_kg !== undefined) {
    const v = Math.round(patch.per_kg * 100);
    track("perKgPaise", (zone as { perKgPaise?: number | null }).perKgPaise, v);
    zone.set("perKgPaise", v);
  }
  if (patch.is_special !== undefined) zone.isSpecial = patch.is_special;
  if (patch.is_active !== undefined) {
    track("isActive", zone.isActive, patch.is_active);
    zone.isActive = patch.is_active;
  }
  await zone.save();
  invalidateZonePricing(); // new prices take effect on the next quote

  await writeAudit({
    action: "zone.updated",
    category: "config",
    severity: "notice",
    actorId: ctx.userId,
    resource: { kind: "zone", id: String(zone._id), name: zone.code },
    changes,
  });
  const list = await adminListZones();
  return { zone: list.zones.find((z) => z.code === code)! };
}

// ── M6c: API-key audit (apikey:revoke.any) ───────────────────────────────────

export async function adminListApiKeys(params: { q?: string; status?: string; limit: number; offset: number }) {
  const filter: Record<string, unknown> = {};
  if (params.status) filter.status = params.status;
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const companies = await CompanyModel.find({ name: rx }).select("_id").lean();
    filter.$or = [{ name: rx }, { prefix: rx }, { companyId: { $in: companies.map((c) => c._id) } }];
  }
  const [total, rows] = await Promise.all([
    ApiKeyModel.countDocuments(filter),
    ApiKeyModel.find(filter).sort({ createdAt: -1 }).skip(params.offset).limit(params.limit).lean(),
  ]);
  const names = await companyNamesForBilling(rows.map((r) => r.companyId));
  return {
    total,
    keys: rows.map((k) => ({
      id: String(k._id),
      name: k.name,
      masked: `${k.prefix}…${k.last4}`,
      mode: k.mode,
      status: k.status,
      company_id: String(k.companyId),
      company_name: names.get(String(k.companyId)) ?? "Unknown",
      request_count: k.requestCount ?? 0,
      last_used_at: k.lastUsedAt ?? null,
      created_at: k.createdAt,
    })),
  };
}

export async function adminForceRevokeKey(id: string) {
  const ctx = getContext();
  const key = await ApiKeyModel.findById(id);
  if (!key) throw AppError.notFound("API key not found");
  if (key.status === "revoked") return { ok: true, status: "revoked" };
  key.status = "revoked";
  key.revokedAt = new Date();
  key.revokedByUserId = ctx.userId;
  await key.save();
  await writeAudit({
    action: "apikey.force_revoked",
    category: "security",
    severity: "critical",
    actorId: ctx.userId,
    companyId: key.companyId,
    resource: { kind: "apiKey", id, name: key.name },
  });
  const company = await CompanyModel.findById(key.companyId).select("ownerUserId").lean();
  void createNotification({
    recipientId: company?.ownerUserId ?? null,
    companyId: key.companyId,
    kind: "key",
    type: "key.force_revoked",
    severity: "error",
    title: "An API key was revoked by Postpin",
    body: `Key "${key.name}" was revoked by platform staff. Contact support if unexpected.`,
    actionUrl: "/app/keys",
  });
  return { ok: true, status: "revoked" };
}

// ── M6c: Platform team (admin:write) ────────────────────────────────────────

export async function listStaffFull() {
  const { RoleModel } = await import("@/models/index.js");
  const [staff, roles] = await Promise.all([
    UserModel.find({ isPlatformStaff: true }).select("name email status roleId lastLoginAt createdAt").lean(),
    RoleModel.find({ companyId: null }).select("key name").lean(),
  ]);
  const roleById = new Map(roles.map((r) => [String(r._id), { key: r.key as string, name: r.name as string }]));
  return {
    staff: staff.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      status: u.status,
      role: roleById.get(String(u.roleId))?.key ?? "unknown",
      role_name: roleById.get(String(u.roleId))?.name ?? "Unknown",
      last_login_at: u.lastLoginAt ?? null,
      created_at: u.createdAt,
    })),
    roles: roles.map((r) => ({ key: r.key as string, name: r.name as string })),
  };
}

export async function updateStaffRole(id: string, roleKey: string) {
  const ctx = getContext();
  if (String(ctx.userId) === id) throw AppError.badRequest("You can't change your own role", "self_role_change");
  const { RoleModel } = await import("@/models/index.js");
  const role = await RoleModel.findOne({ companyId: null, key: roleKey });
  if (!role) throw AppError.badRequest("Unknown platform role", "invalid_role");
  const user = await UserModel.findOne({ _id: id, isPlatformStaff: true });
  if (!user) throw AppError.notFound("Staff member not found");
  // Never demote the last super_admin.
  const superRole = await RoleModel.findOne({ companyId: null, key: "super_admin" });
  if (superRole && String(user.roleId) === String(superRole._id) && roleKey !== "super_admin") {
    const superCount = await UserModel.countDocuments({ isPlatformStaff: true, roleId: superRole._id, status: "active" });
    if (superCount <= 1) throw AppError.badRequest("You can't demote the last super admin", "last_super_admin");
  }
  const before = user.roleId;
  user.roleId = role._id;
  user.permVersion += 1; // force token refresh with the new role
  await user.save();

  // Write-skew guard: two concurrent mutual demotions can each pass the count
  // check above. Re-verify AFTER the write and self-heal by reverting if the
  // platform would be left with zero active super admins.
  if (superRole && roleKey !== "super_admin") {
    const superCountAfter = await UserModel.countDocuments({ isPlatformStaff: true, roleId: superRole._id, status: "active" });
    if (superCountAfter === 0) {
      user.roleId = before;
      user.permVersion += 1;
      await user.save();
      throw AppError.badRequest("You can't demote the last super admin", "last_super_admin");
    }
  }

  await writeAudit({
    action: "admin.role_changed",
    category: "security",
    severity: "warning",
    actorId: ctx.userId,
    resource: { kind: "user", id, name: user.email },
    changes: [{ field: "roleId", before: String(before), after: String(role._id) }],
  });
  return { ok: true, role: roleKey };
}

// ── Tenant impersonation (admin:write + step-up) ─────────────────────────────

export async function impersonateTenant(companyId: string, stepUpToken: string) {
  const ctx = getContext();
  const { verifyPurposeToken, signAccessToken } = await import("@/lib/jwt.js");
  const { randomToken } = await import("@/lib/crypto.js");
  const { resolveRolePerms } = await import("@/services/rbac.service.js");
  const { env } = await import("@/config/env.js");

  // Step-up must be fresh and belong to the calling admin.
  let payload;
  try {
    payload = await verifyPurposeToken(stepUpToken, "step_up");
  } catch {
    throw new AppError("step_up_required", "Re-authenticate to impersonate a tenant", 401);
  }
  if (String(payload.sub) !== String(ctx.userId)) {
    throw new AppError("step_up_required", "Re-authenticate to impersonate a tenant", 401);
  }

  const company = await CompanyModel.findOne({ _id: companyId, deletedAt: null }).lean();
  if (!company) throw AppError.notFound("Tenant not found");
  if (company.status === "suspended") throw AppError.badRequest("Can't impersonate a suspended workspace", "workspace_suspended");
  const owner = company.ownerUserId ? await UserModel.findById(company.ownerUserId).select("name email roleId permVersion status").lean() : null;
  if (!owner || owner.status !== "active") throw AppError.badRequest("Tenant has no active owner to impersonate", "no_active_owner");

  const { roleKey } = await resolveRolePerms(owner.roleId);
  // Impersonation token: acts AS the tenant owner, records the real admin in `act`.
  // Access-token only (no refresh cookie) so exiting simply restores the admin
  // from their untouched session cookie.
  const accessToken = await signAccessToken({
    sub: String(owner._id),
    companyId: String(company._id),
    role: roleKey,
    permVersion: owner.permVersion,
    isPlatformStaff: false,
    sid: `imp-${randomToken(8)}`,
    amr: ["impersonation"],
    act: String(ctx.userId),
  });

  await writeAudit({
    action: "admin.impersonation_started",
    category: "security",
    severity: "critical",
    actorId: ctx.userId,
    companyId: company._id,
    resource: { kind: "company", id: String(company._id), name: company.name },
    metadata: { impersonated_user: String(owner._id), owner_email: owner.email },
  });
  // Ops alert: impersonation is the most sensitive admin action — always fan out.
  void import("@/services/platform-alerts.service.js")
    .then(({ dispatchPlatformAlert }) =>
      dispatchPlatformAlert({
        severity: "critical",
        event: "security.alert",
        title: `Tenant impersonation started — ${company.name}`,
        body: `A platform admin began impersonating ${owner.email} (${company.name}).`,
      }),
    )
    .catch(() => {});

  return {
    access_token: accessToken,
    expires_in: env.ACCESS_TOKEN_TTL,
    tenant: {
      id: String(company._id),
      name: company.name,
      owner_name: owner.name,
      owner_email: owner.email,
    },
  };
}

// ── Platform staff invites + role matrix (admin:write) ───────────────────────

export async function adminInviteStaff(input: { email: string; name: string; role_key: string }) {
  const ctx = getContext();
  const { RoleModel } = await import("@/models/index.js");
  const { randomToken, sha256, hashPassword } = await import("@/lib/crypto.js");
  const { sendInviteEmail } = await import("@/services/email.service.js");

  const email = input.email.toLowerCase().trim();
  const existing = await UserModel.findOne({ email, isPlatformStaff: true }).select("_id").lean();
  if (existing) throw AppError.badRequest("A staff member with this email already exists", "staff_exists");
  const role = await RoleModel.findOne({ companyId: null, key: input.role_key, scope: "platform" });
  if (!role) throw AppError.badRequest("Unknown platform role", "invalid_role");

  const inviteToken = randomToken(32);
  const placeholderHash = await hashPassword(randomToken(24)); // unusable until accepted
  const user = await UserModel.create({
    companyId: null,
    email,
    name: input.name.trim(),
    passwordHash: placeholderHash,
    roleId: role._id,
    isPlatformStaff: true,
    status: "invited",
    passwordResetTokenHash: sha256(inviteToken),
    passwordResetExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    invitedByUserId: ctx.userId,
  });
  await sendInviteEmail(email, inviteToken, "Postpin Platform");
  await writeAudit({
    action: "admin.staff_invited",
    category: "security",
    severity: "warning",
    actorId: ctx.userId,
    resource: { kind: "user", id: String(user._id), name: email },
    metadata: { role: input.role_key },
  });
  return { invited: true, id: String(user._id), email, role: input.role_key };
}

export async function adminRemoveStaff(id: string) {
  const ctx = getContext();
  const { RoleModel } = await import("@/models/index.js");
  const user = await UserModel.findOne({ _id: id, isPlatformStaff: true });
  if (!user) throw AppError.notFound("Staff member not found");
  if (String(user._id) === String(ctx.userId)) throw AppError.badRequest("You can't remove yourself", "self_action");

  const superRole = await RoleModel.findOne({ companyId: null, key: "super_admin" }).select("_id").lean();
  if (superRole && String(user.roleId) === String(superRole._id)) {
    const supers = await UserModel.countDocuments({ isPlatformStaff: true, roleId: superRole._id, status: "active" });
    if (supers <= 1 && user.status === "active") throw AppError.badRequest("You can't remove the last super admin", "last_super_admin");
  }
  // Revoke sessions + hard-block, then soft-delete to free the unique email index.
  await SessionModel.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  user.status = "disabled";
  user.email = `deleted+${String(user._id)}@postpin.invalid`;
  user.deletedAt = new Date();
  user.isPlatformStaff = false;
  await user.save();
  await writeAudit({
    action: "admin.staff_removed",
    category: "security",
    severity: "warning",
    actorId: ctx.userId,
    resource: { kind: "user", id, name: user.email },
  });
  return { ok: true };
}

/** The live per-role permission matrix (real roles × real permissions). */
export async function adminRolePermissionMatrix() {
  const { RoleModel, PermissionModel } = await import("@/models/index.js");
  const [roles, perms] = await Promise.all([
    RoleModel.find({ companyId: null, scope: "platform" }).sort({ name: 1 }).lean(),
    PermissionModel.find({ scope: "platform" }).sort({ group: 1, key: 1 }).lean(),
  ]);
  const keyById = new Map(perms.map((p) => [String(p._id), p.key as string]));
  return {
    permissions: perms.map((p) => ({
      key: p.key,
      group: p.group ?? "General",
      description: p.description ?? "",
      is_dangerous: Boolean((p as { isDangerous?: boolean }).isDangerous),
    })),
    roles: roles.map((r) => ({
      key: r.key,
      name: r.name,
      is_system: Boolean(r.isSystem),
      permissions: ((r.permissionIds ?? []) as unknown[]).map((id) => keyById.get(String(id))).filter(Boolean) as string[],
    })),
  };
}

// ── M6c: Platform settings (settings:write) ─────────────────────────────────

export async function listPlatformSettings() {
  const rows = await SettingsModel.find({ scope: "platform" }).lean();
  return {
    settings: rows.map((s) => ({
      key: s.key,
      value: s.value as Record<string, unknown>,
      editable_by: s.editableBy ?? "super_admin",
      updated_at: s.updatedAt,
    })),
  };
}

export async function updatePlatformSetting(key: string, value: Record<string, unknown>) {
  const ctx = getContext();
  const existing = await SettingsModel.findOne({ scope: "platform", key });
  if (!existing) throw AppError.notFound("Unknown setting");
  const before = existing.value;
  existing.set("value", { ...(existing.value as Record<string, unknown>), ...value });
  await existing.save();
  // Engine defaults are cached on the hot path — flush so edits price the next quote.
  if (key === "engine.defaults") {
    const { invalidateEngineDefaults } = await import("@/services/rate-engine.service.js");
    invalidateEngineDefaults();
  }
  await writeAudit({
    action: "settings.updated",
    category: "config",
    severity: "notice",
    actorId: ctx.userId,
    resource: { kind: "settings", name: key },
    changes: [{ field: key, before, after: existing.value }],
  });
  return { key, value: existing.value as Record<string, unknown> };
}

// ── M6c: Rate-cards overview (cross-tenant, read-only) ──────────────────────

export async function adminRateCardsOverview() {
  const { ZONE_PRICING, SEED_ZONES } = await import("@/data/zones.data.js");
  const { RateCardModel } = await import("@/models/index.js");
  const custom = await RateCardModel.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(50).lean();
  const names = await companyNamesForBilling(custom.map((c) => c.companyId));
  return {
    standard: SEED_ZONES.map((z) => {
      const p = ZONE_PRICING[z.code];
      return {
        zone: z.code,
        name: z.name,
        base_charge: p ? rupees(p.baseChargePaise) : 0,
        per_kg: p ? rupees(p.perKgPaise) : 0,
        sla_min: z.slaDays.min,
        sla_max: z.slaDays.max,
      };
    }),
    custom: custom.map((c) => ({
      id: String(c._id),
      name: c.name,
      code: c.code,
      status: c.status,
      company_id: String(c.companyId),
      company_name: names.get(String(c.companyId)) ?? "Unknown",
      slabs: (c.slabs ?? []).length,
      created_at: c.createdAt,
    })),
  };
}

// ── Admin rate-card management (create / edit / assign / simulate) ────────────

const RC_ZONES = ["within_city", "within_state", "metro", "roi", "ne_jk"] as const;

export interface RateCardRowInput {
  zone_code: string;
  base_charge: number; // rupees, first 500g
  per_500g: number; // rupees, each additional 500g
}
export interface AdminRateCardInput {
  company_id: string;
  name: string;
  service_level?: "surface" | "air" | "express" | "same_day";
  status?: "draft" | "active" | "archived";
  rows: RateCardRowInput[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowsToSlabs(rows: RateCardRowInput[]): any[] {
  return rows
    .filter((r) => RC_ZONES.includes(r.zone_code as (typeof RC_ZONES)[number]))
    .map((r) => ({
      zoneCode: r.zone_code,
      fromWeightG: 0,
      toWeightG: null,
      baseChargePaise: Math.round((r.base_charge ?? 0) * 100),
      stepWeightG: 500,
      stepChargePaise: Math.round((r.per_500g ?? 0) * 100),
    }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adminRateCardDto(c: any, companyName?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = RC_ZONES.map((code) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slab = (c.slabs ?? []).find((s: any) => s.zoneCode === code);
    return {
      zone_code: code,
      base_charge: slab ? rupees(slab.baseChargePaise ?? 0) : 0,
      per_500g: slab ? rupees(slab.stepChargePaise ?? 0) : 0,
    };
  });
  return {
    id: String(c._id),
    name: c.name,
    code: c.code,
    company_id: String(c.companyId),
    company_name: companyName,
    service_level: c.serviceLevel,
    status: c.status,
    is_default: Boolean(c.isDefault),
    rows,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function slugCode(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "card";
  return `${base}-${Math.random().toString(36).slice(2, 5)}`;
}

export async function adminGetRateCard(id: string) {
  const { RateCardModel } = await import("@/models/index.js");
  const doc = await RateCardModel.findOne({ _id: id, isDeleted: false }).lean();
  if (!doc) throw AppError.notFound("Rate card not found");
  const company = await CompanyModel.findById(doc.companyId).select("name").lean();
  return { card: adminRateCardDto(doc, (company as { name?: string } | null)?.name) };
}

export async function adminCreateRateCard(input: AdminRateCardInput) {
  const ctx = getContext();
  const { RateCardModel } = await import("@/models/index.js");
  const company = await CompanyModel.findOne({ _id: input.company_id, deletedAt: null }).select("name").lean();
  if (!company) throw AppError.badRequest("Unknown company", "invalid_company");

  const doc = await RateCardModel.create({
    companyId: new Types.ObjectId(input.company_id),
    name: input.name.trim(),
    code: slugCode(input.name),
    serviceLevel: input.service_level ?? "surface",
    status: input.status ?? "draft",
    slabs: rowsToSlabs(input.rows ?? []),
    createdBy: ctx.userId,
  });
  await writeAudit({
    action: "ratecard.created",
    category: "config",
    severity: "notice",
    actorId: ctx.userId,
    companyId: doc.companyId,
    resource: { kind: "rateCard", id: String(doc._id), name: doc.name },
  });
  return { card: adminRateCardDto(doc, (company as { name?: string }).name) };
}

export interface AdminRateCardPatch {
  name?: string;
  service_level?: "surface" | "air" | "express" | "same_day";
  status?: "draft" | "active" | "archived";
  rows?: RateCardRowInput[];
}

export async function adminUpdateRateCard(id: string, patch: AdminRateCardPatch) {
  const ctx = getContext();
  const { RateCardModel } = await import("@/models/index.js");
  const { invalidateCardCache } = await import("@/services/rate-engine.service.js");
  const doc = await RateCardModel.findOne({ _id: id, isDeleted: false });
  if (!doc) throw AppError.notFound("Rate card not found");

  if (patch.name !== undefined) doc.name = patch.name.trim();
  if (patch.service_level !== undefined) doc.serviceLevel = patch.service_level;
  if (patch.status !== undefined) doc.status = patch.status;
  if (patch.rows !== undefined) doc.set("slabs", rowsToSlabs(patch.rows));
  await doc.save();
  invalidateCardCache(String(doc.companyId));

  await writeAudit({
    action: "ratecard.updated",
    category: "config",
    severity: "notice",
    actorId: ctx.userId,
    companyId: doc.companyId,
    resource: { kind: "rateCard", id: String(doc._id), name: doc.name },
  });
  const company = await CompanyModel.findById(doc.companyId).select("name").lean();
  return { card: adminRateCardDto(doc, (company as { name?: string } | null)?.name) };
}

/** Make a card the tenant's active, default card (demotes its siblings). */
export async function adminAssignRateCard(id: string) {
  const ctx = getContext();
  const { RateCardModel } = await import("@/models/index.js");
  const { invalidateCardCache } = await import("@/services/rate-engine.service.js");
  const doc = await RateCardModel.findOne({ _id: id, isDeleted: false });
  if (!doc) throw AppError.notFound("Rate card not found");

  // Demote every other card for this company, then promote this one.
  await RateCardModel.updateMany(
    { companyId: doc.companyId, _id: { $ne: doc._id } },
    { $set: { isDefault: false } },
  );
  doc.isDefault = true;
  doc.status = "active";
  await doc.save();
  invalidateCardCache(String(doc.companyId));

  await writeAudit({
    action: "ratecard.assigned",
    category: "config",
    severity: "warning",
    actorId: ctx.userId,
    companyId: doc.companyId,
    resource: { kind: "rateCard", id: String(doc._id), name: doc.name },
  });
  const company = await CompanyModel.findById(doc.companyId).select("name").lean();
  return { card: adminRateCardDto(doc, (company as { name?: string } | null)?.name) };
}

export async function adminSimulateRateCard(
  id: string,
  input: { weight_grams: number; zone_code: string; service?: "surface" | "air" | "express" | "same_day"; cod?: boolean; declared_value?: number },
) {
  const { RateCardModel } = await import("@/models/index.js");
  const { simulateCardQuote } = await import("@/services/rate-engine.service.js");
  const doc = await RateCardModel.findOne({ _id: id, isDeleted: false }).lean();
  if (!doc) throw AppError.notFound("Rate card not found");
  const svc = input.service === "air" ? "surface" : input.service; // engine has no "air" tier
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await simulateCardQuote(doc as any, {
    weightGrams: input.weight_grams,
    zoneCode: input.zone_code,
    service: (svc as "surface" | "express" | "same_day") ?? "surface",
    cod: input.cod,
    declaredValuePaise: input.declared_value != null ? Math.round(input.declared_value * 100) : undefined,
  });
  if (!result) throw AppError.badRequest("This card has no pricing for that zone", "zone_not_priced");
  return { result };
}

/** Lightweight tenant picker for the admin rate-card create form. */
export async function adminCompanyOptions(q?: string) {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (q && q.trim()) filter.name = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows = await CompanyModel.find(filter).select("name status").sort({ name: 1 }).limit(50).lean();
  return { companies: rows.map((c) => ({ id: String(c._id), name: c.name, status: c.status })) };
}
