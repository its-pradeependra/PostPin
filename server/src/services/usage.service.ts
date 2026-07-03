/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApiKeyModel, ApiLogModel } from "@/models/index.js";
import { scopedRepo } from "@/tenancy/scoped-repo.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function usageSummary(days = 30) {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows: any[] = await scopedRepo(ApiLogModel).aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        calls: { $sum: 1 },
        success: { $sum: { $cond: [{ $lt: ["$statusCode", 400] }, 1, 0] } },
        latencySum: { $sum: { $ifNull: ["$latencyMs", 0] } },
        latencyCount: { $sum: { $cond: [{ $gt: ["$latencyMs", 0] }, 1, 0] } },
      },
    },
  ]);
  const agg = rows[0];
  const calls = agg?.calls ?? 0;
  const success = agg?.success ?? 0;
  const activeKeys = await scopedRepo(ApiKeyModel).countDocuments({ status: "active" });

  return {
    calls,
    success_rate: calls > 0 ? success / calls : 1,
    avg_latency_ms: agg?.latencyCount ? Math.round(agg.latencySum / agg.latencyCount) : 0,
    active_keys: activeKeys,
    window_days: days,
  };
}

export async function usageSeries(days = 30) {
  const since = new Date(Date.now() - (days - 1) * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);
  const rows: any[] = await scopedRepo(ApiLogModel).aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        calls: { $sum: 1 },
        success: { $sum: { $cond: [{ $lt: ["$statusCode", 400] }, 1, 0] } },
        latencySum: { $sum: { $ifNull: ["$latencyMs", 0] } },
        latencyCount: { $sum: { $cond: [{ $gt: ["$latencyMs", 0] }, 1, 0] } },
      },
    },
  ]);
  const map = new Map(rows.map((r) => [r._id as string, r]));
  const series: Array<{ date: string; calls: number; success: number; failed: number; avg_latency_ms: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    const r = map.get(key);
    const calls = r?.calls ?? 0;
    const success = r?.success ?? 0;
    series.push({
      date: key,
      calls,
      success,
      failed: Math.max(0, calls - success),
      avg_latency_ms: r?.latencyCount ? Math.round(r.latencySum / r.latencyCount) : 0,
    });
  }
  return series;
}

export async function usageByEndpoint(days = 30) {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows: any[] = await scopedRepo(ApiLogModel).aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: "$endpoint",
        calls: { $sum: 1 },
        success: { $sum: { $cond: [{ $lt: ["$statusCode", 400] }, 1, 0] } },
        latencySum: { $sum: { $ifNull: ["$latencyMs", 0] } },
        latencyCount: { $sum: { $cond: [{ $gt: ["$latencyMs", 0] }, 1, 0] } },
      },
    },
    { $sort: { calls: -1 } },
    { $limit: 20 },
  ]);
  return rows.map((r) => ({
    endpoint: (r._id as string) ?? "unknown",
    calls: r.calls,
    success_rate: r.calls > 0 ? r.success / r.calls : 1,
    avg_latency_ms: r.latencyCount ? Math.round(r.latencySum / r.latencyCount) : 0,
  }));
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  "2xx": { label: "2xx OK", color: "#16a34a" },
  "4xx": { label: "4xx Client", color: "#2563eb" },
  "429": { label: "429 Rate-limited", color: "#d97706" },
  "5xx": { label: "5xx Server", color: "#dc2626" },
};

export async function usageByStatus(days = 30) {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows: any[] = await scopedRepo(ApiLogModel).aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          $switch: {
            branches: [
              { case: { $eq: ["$statusCode", 429] }, then: "429" },
              { case: { $lt: ["$statusCode", 300] }, then: "2xx" },
              { case: { $lt: ["$statusCode", 500] }, then: "4xx" },
            ],
            default: "5xx",
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  return (["2xx", "4xx", "429", "5xx"] as const)
    .map((bucket) => {
      const r = rows.find((x) => x._id === bucket);
      const count = r?.count ?? 0;
      const meta = STATUS_META[bucket]!;
      return { label: meta.label, value: Math.round((count / total) * 1000) / 10, count, color: meta.color };
    })
    .filter((s) => s.count > 0 || s.label.startsWith("2xx"));
}

export async function recentLogs(limit = 10, apiKeyId?: string) {
  const filter = apiKeyId ? { apiKeyId } : {};
  const rows: any[] = await scopedRepo(ApiLogModel).find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((l) => ({
    id: String(l._id),
    endpoint: l.endpoint ?? null,
    method: l.method ?? "POST",
    status: l.statusCode ?? 0,
    latency_ms: l.latencyMs ?? 0,
    key_prefix: l.keyPrefix ?? null,
    mode: l.mode ?? null,
    outcome: l.outcome ?? null,
    detail: l.detail ?? null,
    at: l.createdAt,
  }));
}

/** Billable calls for the tenant since a date (used for subscription quota). */
export async function billableCallsSince(since: Date): Promise<number> {
  return scopedRepo(ApiLogModel).countDocuments({ createdAt: { $gte: since }, billable: true });
}
