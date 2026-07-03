import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import { requireTenant } from "@/middleware/tenant.js";
import { recentLogs, usageByEndpoint, usageByStatus, usageSeries, usageSummary } from "@/services/usage.service.js";

const daysQ = z.object({ days: z.coerce.number().min(1).max(90).default(30) });

export async function usageRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const guard = [authenticate, requireTenant, requirePermission("usage:read")];

  app.get("/summary", { preHandler: guard, schema: { querystring: daysQ } }, async (req) => ({
    data: await usageSummary(req.query.days),
  }));

  app.get("/series", { preHandler: guard, schema: { querystring: daysQ } }, async (req) => ({
    data: await usageSeries(req.query.days),
  }));

  app.get(
    "/logs",
    {
      preHandler: guard,
      schema: { querystring: z.object({ limit: z.coerce.number().min(1).max(100).default(10), key_id: z.string().optional() }) },
    },
    async (req) => ({ data: await recentLogs(req.query.limit, req.query.key_id) }),
  );

  app.get("/endpoints", { preHandler: guard, schema: { querystring: daysQ } }, async (req) => ({
    data: await usageByEndpoint(req.query.days),
  }));

  app.get("/status", { preHandler: guard, schema: { querystring: daysQ } }, async (req) => ({
    data: await usageByStatus(req.query.days),
  }));
}
