import type { FastifyInstance, FastifyRequest } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "@/lib/errors.js";
import { PincodeModel, PlanModel } from "@/models/index.js";
import { calculateRate, resolvePincode, type ServiceLevel } from "@/services/rate-engine.service.js";
import { publicStats, publicStatus } from "@/services/public-stats.service.js";

const PIN = z.string().regex(/^\d{6}$/);

const rateBody = z.object({
  origin: PIN,
  destination: PIN,
  weight: z.number().positive().max(100_000), // grams
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  service: z.enum(["surface", "express", "same_day"]).default("surface"),
  cod: z.boolean().optional(),
  declared_value: z.number().nonnegative().optional(), // rupees
});

function meta(req: FastifyRequest, engineMs?: number) {
  return { request_id: String(req.id), api_version: "v1", cached: false, ...(engineMs != null ? { engine_ms: engineMs } : {}) };
}

export async function publicRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const rl = (max: number) => ({ rateLimit: { max, timeWindow: "1 minute" } });

  app.post("/rates/calculate", { schema: { body: rateBody }, config: rl(30) }, async (req) => {
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
    return { data: result, meta: meta(req, Math.round(engineMs * 100) / 100) };
  });

  app.get("/serviceability/:pin", { schema: { params: z.object({ pin: PIN }) }, config: rl(60) }, async (req) => {
    const m = await resolvePincode(req.params.pin);
    return {
      data: { pincode: req.params.pin, serviceable: m?.serviceable ?? false, found: Boolean(m), city: m?.city ?? null, state: m?.state ?? null },
      meta: meta(req),
    };
  });

  app.get("/pincodes/:code", { schema: { params: z.object({ code: PIN }) }, config: rl(60) }, async (req) => {
    const doc = await PincodeModel.findOne({ pincode: req.params.code, status: "active" }).lean();
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
  });

  app.get("/plans", { config: rl(60) }, async (req) => {
    const plans = await PlanModel.find({ isActive: true, isPublic: true }).sort({ sortOrder: 1 }).lean();
    return {
      data: plans.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        price_monthly_paise: p.priceMonthlyPaise,
        price_yearly_paise: p.priceYearlyPaise,
        included_calls: p.includedCalls,
        overage_per_1k_paise: p.overagePer1kPaise,
        rate_limit: p.rateLimit,
        max_api_keys: p.maxApiKeys,
        max_team_members: p.maxTeamMembers,
        features: p.features,
        sort_order: p.sortOrder,
      })),
      meta: meta(req),
    };
  });

  // Live platform status (public status page). Real component health + 90-day
  // uptime derived from request logs.
  app.get("/status", { config: rl(30) }, async (req) => ({ data: await publicStatus(), meta: meta(req) }));

  // Real platform stats for the marketing pages.
  app.get("/stats", { config: rl(30) }, async (req) => ({ data: await publicStats(), meta: meta(req) }));
}
