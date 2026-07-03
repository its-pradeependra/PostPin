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
