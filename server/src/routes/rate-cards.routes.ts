import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import { requireTenant } from "@/middleware/tenant.js";
import * as cards from "@/services/rate-card.service.js";

const idParam = z.object({ id: z.string().min(1) });

const slabSchema = z.object({
  zoneCode: z.enum(["within_city", "within_state", "metro", "roi", "ne_jk"]),
  fromWeightG: z.number().int().min(0),
  toWeightG: z.number().int().positive().nullable().optional(),
  baseChargePaise: z.number().int().min(0),
  stepWeightG: z.number().int().positive().optional(),
  stepChargePaise: z.number().int().min(0).optional(),
});

const createBody = z.object({
  name: z.string().min(2).max(80),
  serviceLevel: z.enum(["surface", "air", "express", "same_day"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  slabs: z.array(slabSchema).optional(),
});

export async function rateCardsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const read = [authenticate, requireTenant, requirePermission("ratecard:read")];
  const write = [authenticate, requireTenant, requirePermission("ratecard:write")];

  app.get("/", { preHandler: read }, async () => cards.listRateCards());

  app.get("/:id", { preHandler: read, schema: { params: idParam } }, async (req) => cards.getRateCard(req.params.id));

  app.post("/", { preHandler: write, schema: { body: createBody } }, async (req, reply) =>
    reply.code(201).send(await cards.createRateCard(req.body)),
  );

  app.patch(
    "/:id",
    { preHandler: write, schema: { params: idParam, body: createBody.partial() } },
    async (req) => cards.updateRateCard(req.params.id, req.body),
  );

  app.delete("/:id", { preHandler: write, schema: { params: idParam } }, async (req) =>
    cards.deleteRateCard(req.params.id),
  );
}
