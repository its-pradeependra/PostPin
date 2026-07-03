import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import { requireTenant } from "@/middleware/tenant.js";
import * as webhooks from "@/services/webhook.service.js";

const idParam = z.object({ id: z.string().min(1) });
const httpsUrl = z.string().url().refine((u) => u.startsWith("https://"), "Endpoint must use HTTPS");
const eventEnum = z.enum(webhooks.WEBHOOK_EVENTS);

export async function webhooksRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // No `webhook:read` in the catalog — managing webhooks (a developer feature)
  // gates both reads and writes on `webhook:write`.
  const guard = [authenticate, requireTenant, requirePermission("webhook:write")];

  app.get("/", { preHandler: guard }, async () => ({ webhooks: await webhooks.listWebhooks() }));

  app.post(
    "/",
    {
      preHandler: guard,
      schema: {
        body: z.object({
          url: httpsUrl,
          events: z.array(eventEnum).min(1),
          description: z.string().max(200).optional(),
        }),
      },
    },
    async (req, reply) => reply.code(201).send(await webhooks.createWebhook(req.body)),
  );

  app.patch(
    "/:id",
    {
      preHandler: guard,
      schema: {
        params: idParam,
        body: z.object({
          url: httpsUrl.optional(),
          events: z.array(eventEnum).min(1).optional(),
          description: z.string().max(200).optional(),
          status: z.enum(["active", "paused", "disabled"]).optional(),
        }),
      },
    },
    async (req) => ({ webhook: await webhooks.updateWebhook(req.params.id, req.body) }),
  );

  app.post("/:id/roll-secret", { preHandler: guard, schema: { params: idParam } }, async (req) =>
    webhooks.rollSecret(req.params.id),
  );

  app.post("/:id/test", { preHandler: guard, schema: { params: idParam } }, async (req) =>
    webhooks.testWebhook(req.params.id),
  );

  app.delete("/:id", { preHandler: guard, schema: { params: idParam } }, async (req) =>
    webhooks.deleteWebhook(req.params.id),
  );

  app.get(
    "/deliveries",
    {
      preHandler: guard,
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          webhook_id: z.string().optional(),
        }),
      },
    },
    async (req) => ({ deliveries: await webhooks.listDeliveries(req.query.limit, req.query.webhook_id) }),
  );

  app.post("/deliveries/:id/replay", { preHandler: guard, schema: { params: idParam } }, async (req) =>
    webhooks.replayDelivery(req.params.id),
  );
}
