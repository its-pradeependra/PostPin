import mongoose from "mongoose";
import { ApiLogModel, PincodeModel, PlanModel, ZoneModel } from "@/models/index.js";
import { redisReady } from "@/lib/redis.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ComponentStatus = "operational" | "degraded" | "outage";

function statusFromErrorRate(total: number, errors: number): ComponentStatus {
  if (total === 0) return "operational"; // no traffic ≠ an outage
  const rate = errors / total;
  if (rate >= 0.05) return "outage";
  if (rate >= 0.01) return "degraded";
  return "operational";
}

/** Live platform status: real component health + uptime/latency derived from
 * the 90-day API log history (matches the apiLogs TTL). Public + cacheable. */
export async function publicStatus() {
  const now = Date.now();
  const d90 = new Date(now - 90 * DAY_MS);
  const d1 = new Date(now - DAY_MS);

  const dbUp = mongoose.connection.readyState === 1;
  const redisUp = redisReady();

  // 90-day daily error-rate history + 24h latency, all from real request logs.
  const [daily, last24] = await Promise.all([
    ApiLogModel.aggregate([
      { $match: { createdAt: { $gte: d90 } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: 1 },
          errors: { $sum: { $cond: [{ $gte: ["$statusCode", 500] }, 1, 0] } },
        },
      },
    ]),
    ApiLogModel.aggregate([
      { $match: { createdAt: { $gte: d1 } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          errors: { $sum: { $cond: [{ $gte: ["$statusCode", 500] }, 1, 0] } },
          avg: { $avg: "$latencyMs" },
        },
      },
    ]),
  ]);

  const byDay = new Map(
    (daily as Array<{ _id: string; total: number; errors: number }>).map((r) => [r._id, r]),
  );
  const history: Array<{ date: string; status: ComponentStatus | "no_data" }> = [];
  let totalReq = 0;
  let totalErr = 0;
  for (let i = 89; i >= 0; i--) {
    const key = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    const row = byDay.get(key);
    if (!row) {
      history.push({ date: key, status: "no_data" });
    } else {
      totalReq += row.total;
      totalErr += row.errors;
      history.push({ date: key, status: statusFromErrorRate(row.total, row.errors) });
    }
  }
  const uptimePct = totalReq === 0 ? 100 : Math.round((1 - totalErr / totalReq) * 10000) / 100;

  const t24 = last24[0] as { total: number; errors: number; avg: number } | undefined;
  const apiStatus: ComponentStatus = !dbUp ? "outage" : statusFromErrorRate(t24?.total ?? 0, t24?.errors ?? 0);

  const components = [
    { id: "api", name: "Rate Calculation API", status: apiStatus, uptime_pct: uptimePct },
    { id: "database", name: "Pincode & Data Store", status: (dbUp ? "operational" : "outage") as ComponentStatus, uptime_pct: uptimePct },
    { id: "cache", name: "Rate Limiting & Cache", status: (redisUp ? "operational" : "degraded") as ComponentStatus, uptime_pct: uptimePct },
    { id: "dashboard", name: "Dashboard & Portal", status: "operational" as ComponentStatus, uptime_pct: uptimePct },
  ];
  const overall: ComponentStatus = components.some((c) => c.status === "outage")
    ? "outage"
    : components.some((c) => c.status === "degraded")
      ? "degraded"
      : "operational";

  return {
    overall,
    updated_at: new Date().toISOString(),
    components,
    uptime_90d_pct: uptimePct,
    avg_latency_24h_ms: Math.round(t24?.avg ?? 0),
    requests_24h: t24?.total ?? 0,
    history,
  };
}

/** Real public platform stats for the marketing pages (/features, /about). */
export async function publicStats() {
  const [pincodes, metros, states, zones, plans] = await Promise.all([
    PincodeModel.countDocuments({ status: "active" }),
    PincodeModel.countDocuments({ status: "active", isMetro: true }),
    PincodeModel.distinct("state", { status: "active" }),
    ZoneModel.find({ isActive: true }).sort({ tier: 1 }).select("code name tier description slaDays isSpecial").lean(),
    PlanModel.countDocuments({ isActive: true, isPublic: true }),
  ]);
  return {
    pincodes,
    metros,
    states: states.filter(Boolean).length,
    public_plans: plans,
    zones: zones.map((z) => ({
      code: z.code,
      name: z.name,
      tier: z.tier,
      description: z.description ?? "",
      sla_min: z.slaDays?.min ?? 1,
      sla_max: z.slaDays?.max ?? 5,
      is_special: Boolean(z.isSpecial),
    })),
  };
}
