import type { FastifyInstance, FastifyRequest } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { tryGetContext } from "@/context/request-context.js";
import { logger } from "@/lib/logger.js";
import { apiKeyAuth, getKeyAuthInfo } from "@/middleware/api-key-auth.js";
import { ApiLogModel } from "@/models/index.js";
import { calculateRate, type ServiceLevel } from "@/services/rate-engine.service.js";

const PIN = z.string().regex(/^\d{6}$/);
const rateBody = z.object({
  origin: PIN,
  destination: PIN,
  weight: z.number().positive().max(100_000),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  service: z.enum(["surface", "air", "express", "same_day"]).default("surface"),
  cod: z.boolean().optional(),
  declared_value: z.number().nonnegative().optional(),
});

function logCall(
  req: FastifyRequest,
  endpoint: string,
  statusCode: number,
  latencyMs: number,
  detail?: Record<string, unknown>,
) {
  const ctx = tryGetContext();
  const info = getKeyAuthInfo(req);
  if (!ctx?.companyId || !info) return;
  void ApiLogModel.create({
    companyId: ctx.companyId,
    apiKeyId: info.apiKeyId,
    keyPrefix: info.keyPrefix,
    requestId: ctx.requestId,
    method: req.method,
    endpoint,
    statusCode,
    outcome: statusCode < 400 ? "success" : statusCode < 500 ? "client_error" : "server_error",
    latencyMs: Math.round(latencyMs),
    mode: info.mode,
    billable: true,
    ip: ctx.ip,
    detail,
  }).catch((e) => logger.warn({ err: (e as Error).message }, "apiLog write failed"));
}

export async function ratesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.post("/calculate", { preHandler: [apiKeyAuth], schema: { body: rateBody } }, async (req) => {
    const b = req.body;
    const ctx = tryGetContext();
    const start = process.hrtime.bigint();
    let result;
    try {
      result = await calculateRate({
        origin: b.origin,
        destination: b.destination,
        weightGrams: b.weight,
        length: b.length,
        width: b.width,
        height: b.height,
        service: b.service as ServiceLevel,
        cod: b.cod,
        declaredValuePaise: b.declared_value != null ? Math.round(b.declared_value * 100) : undefined,
        companyId: ctx?.companyId ? String(ctx.companyId) : undefined,
      });
    } catch (err) {
      // Failed keyed calls must still land in apiLogs — dashboards and billable
      // counts otherwise under-report vs the Redis quota counter.
      const engineMs = Number(process.hrtime.bigint() - start) / 1e6;
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      logCall(req, "/v1/rates/calculate", statusCode, engineMs, { origin: b.origin, destination: b.destination });
      throw err;
    }
    const engineMs = Number(process.hrtime.bigint() - start) / 1e6;
    logCall(req, "/v1/rates/calculate", 200, engineMs, {
      origin: result.origin.pincode,
      destination: result.destination.pincode,
      zone: result.zone,
    });
    if (ctx?.companyId) {
      // Outbound webhook fan-out for rate.calculated subscribers (fire-and-forget).
      void import("@/services/webhook.service.js")
        .then(({ emitWebhookEvent }) =>
          emitWebhookEvent(ctx.companyId, "rate.calculated", {
            origin: result.origin.pincode,
            destination: result.destination.pincode,
            zone: result.zone,
            service: result.service,
            total: result.total,
            chargeable_weight_grams: result.chargeableWeightGrams,
          }),
        )
        .catch(() => {});
      // Advance the onboarding funnel on the tenant's first keyed call.
      void import("@/models/index.js")
        .then(({ CompanyModel }) =>
          CompanyModel.findOneAndUpdate(
            { _id: ctx.companyId, onboardingStep: "key_created" },
            { $set: { onboardingStep: "first_call" } },
          ),
        )
        .catch(() => {});
    }
    return {
      data: result,
      meta: { request_id: String(req.id), api_version: "v1", cached: false, engine_ms: Math.round(engineMs * 100) / 100 },
    };
  });
}
