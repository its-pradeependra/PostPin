import type { FastifyReply, FastifyRequest } from "fastify";
import type { Types } from "mongoose";
import { setContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import { getRedis, redisReady } from "@/lib/redis.js";
import { ApiKeyModel, PlanModel, SubscriptionModel } from "@/models/index.js";
import { hashIncomingKey } from "@/services/api-key.service.js";

export interface KeyAuthInfo {
  apiKeyId: Types.ObjectId;
  mode: "live" | "test";
  keyPrefix: string;
}

const keyInfo = new WeakMap<FastifyRequest, KeyAuthInfo>();
export function getKeyAuthInfo(req: FastifyRequest): KeyAuthInfo | undefined {
  return keyInfo.get(req);
}

/** Authenticate a request via an API key (Bearer), enforce rate-limit + monthly quota. */
export async function apiKeyAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) throw AppError.unauthorized("Missing API key", "missing_key");
  const raw = header.slice(7).trim();

  const key = await ApiKeyModel.findOne({ hashedKey: hashIncomingKey(raw) });
  if (!key || key.status !== "active") throw AppError.unauthorized("Invalid or revoked API key", "invalid_key");
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) throw AppError.unauthorized("API key expired", "key_expired");

  const sub = await SubscriptionModel.findOne({ companyId: key.companyId, status: "active" }).lean();
  if (!sub) throw AppError.forbidden("No active subscription for this key", "no_subscription");
  const plan = await PlanModel.findById(sub.planId).lean();
  const rpm = plan?.rateLimit?.rpm ?? 30;
  const included = plan?.includedCalls ?? 0;
  const hasOverage = plan?.overagePer1kPaise != null;

  // Rate-limit + quota (Redis). Fail-open if Redis is unavailable.
  if (redisReady()) {
    const r = getRedis();
    const minute = Math.floor(Date.now() / 60_000);
    const rlKey = `rl:${String(key._id)}:${minute}`;
    const count = await r.incr(rlKey);
    if (count === 1) await r.expire(rlKey, 65);
    reply.header("x-ratelimit-limit", String(rpm));
    reply.header("x-ratelimit-remaining", String(Math.max(0, rpm - count)));
    if (count > rpm) {
      reply.header("retry-after", "60");
      throw new AppError("rate_limited", "Rate limit exceeded", 429);
    }

    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const qKey = `quota:${String(key.companyId)}:${period}`;
    const used = await r.incr(qKey);
    if (used === 1) await r.expire(qKey, 60 * 60 * 24 * 40);
    reply.header("x-quota-remaining", included === -1 ? "unlimited" : String(Math.max(0, included - used)));
    if (included !== -1 && used > included && !hasOverage) {
      throw new AppError("quota_exceeded", "Monthly quota exceeded — upgrade your plan", 402);
    }

    // Quota warning: notify the owner ONCE per period when usage crosses the
    // company's warning threshold (default 80%). SETNX makes it idempotent.
    if (included > 0) {
      void (async () => {
        const { CompanyModel } = await import("@/models/index.js");
        const company = (await CompanyModel.findById(key.companyId).select("quotaWarningPct ownerUserId name").lean()) as {
          quotaWarningPct?: number;
          ownerUserId?: Types.ObjectId | null;
          name?: string;
        } | null;
        const pctLimit = company?.quotaWarningPct ?? 80;
        const usedPct = (used / included) * 100;
        if (usedPct < pctLimit || !company?.ownerUserId) return;
        const flag = await r.set(`quota_warned:${String(key.companyId)}:${period}`, "1", "EX", 60 * 60 * 24 * 40, "NX");
        if (flag !== "OK") return; // already warned this period
        const { createNotification } = await import("@/services/notification.service.js");
        await createNotification({
          recipientId: company.ownerUserId,
          companyId: key.companyId,
          kind: "usage",
          type: "usage.threshold",
          severity: "warning",
          title: `You've used ${Math.floor(usedPct)}% of your monthly quota`,
          body: `${used.toLocaleString("en-IN")} of ${included.toLocaleString("en-IN")} included calls used this period. Upgrade to avoid hitting the limit.`,
          actionUrl: "/app/billing/plans",
        });
      })().catch(() => {
        /* warning is best-effort — never blocks the call */
      });
    }
  }

  setContext({
    userId: null,
    companyId: key.companyId ?? null,
    roleKey: "api_key",
    isPlatformStaff: false,
    permissions: new Set(["rates:read"]),
    permVersion: 0,
    sessionId: null,
  });
  keyInfo.set(req, { apiKeyId: key._id, mode: key.mode as "live" | "test", keyPrefix: key.prefix });

  void ApiKeyModel.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() }, $inc: { requestCount: 1 } });
}
