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

  const attachmentSchema = z
    .array(
      z.object({
        url: z.string().url().max(500),
        name: z.string().max(200),
        mimetype: z.string().max(100),
        size: z.number().int().min(0).max(50_000_000),
      }),
    )
    .max(5)
    .optional();

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
          attachments: attachmentSchema,
        }),
      },
    },
    async (req, reply) => reply.code(201).send(await tickets.createTicket(req.body)),
  );

  app.post(
    "/:id/replies",
    { preHandler: write, schema: { params: idParam, body: z.object({ body: z.string().min(1).max(5000), attachments: attachmentSchema }) } },
    async (req, reply) => reply.code(201).send(await tickets.replyToTicket(req.params.id, req.body.body, req.body.attachments ?? [])),
  );

  // Upload a ticket attachment (returns metadata the client attaches to a ticket/reply).
  app.post("/uploads", { preHandler: [authenticate, requireTenant] }, async (req, reply) => {
    const { saveUpload, ATTACHMENT_MIMES } = await import("@/services/upload.service.js");
    const { getContext } = await import("@/context/request-context.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (req as any).file();
    if (!data) return reply.code(400).send({ error: { code: "no_file", message: "No file uploaded" } });
    const buffer = await data.toBuffer();
    if (data.file.truncated) return reply.code(400).send({ error: { code: "file_too_large", message: "File is too large" } });
    const saved = saveUpload({ buffer, mimetype: data.mimetype, originalName: data.filename, category: "tickets", ownerId: String(getContext().companyId), allowed: ATTACHMENT_MIMES });
    return { attachment: { url: saved.url, name: saved.original_name, mimetype: saved.mimetype, size: saved.size } };
  });
}
