import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import { requireTenant } from "@/middleware/tenant.js";
import * as keys from "@/services/api-key.service.js";

const idParam = z.object({ id: z.string().min(1) });

export async function keysRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const guard = (perm: string) => [authenticate, requireTenant, requirePermission(perm)];

  app.get("/", { preHandler: guard("apikey:read") }, async () => ({ keys: await keys.listKeys() }));

  app.get("/:id", { preHandler: guard("apikey:read"), schema: { params: idParam } }, async (req) => ({
    key: await keys.getKey(req.params.id),
  }));

  app.post(
    "/",
    {
      preHandler: guard("apikey:create"),
      schema: {
        body: z.object({
          name: z.string().min(2).max(60),
          mode: z.enum(["live", "test"]).default("test"),
          allowed_domains: z.array(z.string()).optional(),
        }),
      },
    },
    async (req, reply) => {
      const r = await keys.createKey({ name: req.body.name, mode: req.body.mode, allowedDomains: req.body.allowed_domains });
      return reply.code(201).send(r);
    },
  );

  app.post("/:id/rotate", { preHandler: guard("apikey:revoke"), schema: { params: idParam } }, async (req) =>
    keys.rotateKey(req.params.id),
  );

  app.post("/:id/revoke", { preHandler: guard("apikey:revoke"), schema: { params: idParam } }, async (req) =>
    keys.revokeKey(req.params.id),
  );

  app.patch(
    "/:id",
    {
      preHandler: guard("apikey:create"),
      schema: {
        params: idParam,
        body: z.object({ name: z.string().min(2).max(60).optional(), allowed_domains: z.array(z.string()).optional() }),
      },
    },
    async (req) => keys.updateKey(req.params.id, { name: req.body.name, allowedDomains: req.body.allowed_domains }),
  );
}
