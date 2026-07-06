import type { FastifyInstance, FastifyRequest } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { tryGetContext } from "@/context/request-context.js";
import { logger } from "@/lib/logger.js";
import { AppError } from "@/lib/errors.js";
import { apiKeyAuth, getKeyAuthInfo } from "@/middleware/api-key-auth.js";
import { ApiLogModel, PincodeModel } from "@/models/index.js";
import { resolvePincode } from "@/services/rate-engine.service.js";

const PIN = z.string().regex(/^\d{6}$/);

function meta(req: FastifyRequest) {
  return { request_id: String(req.id), api_version: "v1", cached: false };
}

/** Same billable apiLog write as the rates route — lookups count toward quota. */
function logCall(req: FastifyRequest, endpoint: string, statusCode: number, latencyMs: number, detail?: Record<string, unknown>) {
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

/** Keyed lookup endpoints (documented in /docs): serviceability + pincode search. */
export async function lookupRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/serviceability/:pin",
    { preHandler: [apiKeyAuth], schema: { params: z.object({ pin: PIN }) } },
    async (req) => {
      const start = process.hrtime.bigint();
      const m = await resolvePincode(req.params.pin);
      logCall(req, "/v1/serviceability/:pin", 200, Number(process.hrtime.bigint() - start) / 1e6, { pincode: req.params.pin });
      return {
        data: {
          pincode: req.params.pin,
          serviceable: m?.serviceable ?? false,
          found: Boolean(m),
          city: m?.city ?? null,
          state: m?.state ?? null,
        },
        meta: meta(req),
      };
    },
  );

  app.get(
    "/pincodes",
    {
      preHandler: [apiKeyAuth],
      schema: {
        querystring: z.object({
          q: z.string().min(2).max(60),
          limit: z.coerce.number().int().min(1).max(10).default(5),
        }),
      },
    },
    async (req) => {
      const start = process.hrtime.bigint();
      const { q, limit } = req.query;
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(`^${escaped}`, "i");
      const filter = /^\d+$/.test(q)
        ? { status: "active", pincode: rx }
        : { status: "active", $or: [{ city: rx }, { district: rx }, { state: rx }] };
      const docs = await PincodeModel.find(filter).sort({ pincode: 1 }).limit(limit + 1).lean();
      const hasMore = docs.length > limit;
      const page = docs.slice(0, limit);
      logCall(req, "/v1/pincodes", 200, Number(process.hrtime.bigint() - start) / 1e6, { q, results: page.length });
      return {
        data: page.map((d) => ({
          pincode: d.pincode,
          city: d.city ?? d.district ?? null,
          state: d.state ?? null,
          metro: d.isMetro ?? false,
          serviceable: d.serviceable ?? false,
        })),
        meta: { ...meta(req), has_more: hasMore },
      };
    },
  );

  app.get(
    "/pincodes/:code",
    { preHandler: [apiKeyAuth], schema: { params: z.object({ code: PIN }) } },
    async (req) => {
      const start = process.hrtime.bigint();
      const doc = await PincodeModel.findOne({ pincode: req.params.code, status: "active" }).lean();
      logCall(req, "/v1/pincodes/:code", doc ? 200 : 404, Number(process.hrtime.bigint() - start) / 1e6, { pincode: req.params.code });
      if (!doc) throw AppError.notFound("Pincode not found");
      return {
        data: {
          pincode: doc.pincode,
          city: doc.city ?? doc.district ?? null,
          state: doc.state ?? null,
          state_code: doc.stateCode ?? null,
          is_metro: doc.isMetro,
          is_remote: doc.isRemote,
          serviceable: doc.serviceable,
        },
        meta: meta(req),
      };
    },
  );
}
