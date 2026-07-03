import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import { requireTenant } from "@/middleware/tenant.js";
import * as tickets from "@/services/ticket.service.js";

const idParam = z.object({ id: z.string().min(1) });
const statusEnum = z.enum(["open", "pending", "on_hold", "resolved", "closed"]);
const categoryEnum = z.enum(["billing", "api", "pincode-data", "account", "feature-request", "other"]);
const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

export async function ticketsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Reads: any authenticated tenant user (scoped to own company). Writes: ticket:create.
  const read = [authenticate, requireTenant];
  const write = [authenticate, requireTenant, requirePermission("ticket:create")];

  app.get(
    "/",
    { preHandler: read, schema: { querystring: z.object({ status: statusEnum.optional() }) } },
    async (req) => ({ tickets: await tickets.listTickets(req.query.status) }),
  );

  app.get("/:id", { preHandler: read, schema: { params: idParam } }, async (req) => ({
    ticket: await tickets.getTicket(req.params.id),
  }));

  app.post(
    "/",
    {
      preHandler: write,
      schema: {
        body: z.object({
          subject: z.string().min(4).max(120),
          category: categoryEnum,
          priority: priorityEnum,
          body: z.string().min(10).max(5000),
        }),
      },
    },
    async (req, reply) => reply.code(201).send(await tickets.createTicket(req.body)),
  );

  app.post(
    "/:id/replies",
    { preHandler: write, schema: { params: idParam, body: z.object({ body: z.string().min(1).max(5000) }) } },
    async (req, reply) => reply.code(201).send(await tickets.replyToTicket(req.params.id, req.body.body)),
  );
}
