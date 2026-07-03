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
  service: z.enum(["surface", "express", "same_day"]).default("surface"),
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
    const start = process.hrtime.bigint();
    const result = await calculateRate({
      origin: b.origin,
      destination: b.destination,
      weightGrams: b.weight,
      length: b.length,
      width: b.width,
      height: b.height,
      service: b.service as ServiceLevel,
      cod: b.cod,
      declaredValuePaise: b.declared_value != null ? Math.round(b.declared_value * 100) : undefined,
    });
    const engineMs = Number(process.hrtime.bigint() - start) / 1e6;
    logCall(req, "/v1/rates/calculate", 200, engineMs, {
      origin: result.origin.pincode,
      destination: result.destination.pincode,
      zone: result.zone,
    });
    return {
      data: result,
      meta: { request_id: String(req.id), api_version: "v1", cached: false, engine_ms: Math.round(engineMs * 100) / 100 },
    };
  });
}
