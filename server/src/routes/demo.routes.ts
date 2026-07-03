import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { Schema, model } from "mongoose";
import { z } from "zod";
import { getContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import { requireTenant } from "@/middleware/tenant.js";
import { scopedRepo } from "@/tenancy/scoped-repo.js";

// A throwaway scoped collection used only to prove tenant isolation over HTTP.
const demoSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    label: { type: String },
  },
  { timestamps: true },
);
demoSchema.index({ companyId: 1, label: 1 });
const DemoThing = model("DemoThing", demoSchema);

export async function demoRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get("/profile", { preHandler: [authenticate] }, async () => {
    const ctx = getContext();
    return {
      company_id: ctx.companyId ? String(ctx.companyId) : null,
      role: ctx.roleKey,
      is_platform_staff: ctx.isPlatformStaff,
      permissions: [...ctx.permissions],
    };
  });

  app.get("/things", { preHandler: [authenticate, requireTenant] }, async () => {
    const rows = await scopedRepo(DemoThing).find();
    return { things: rows.map((r) => ({ id: String(r._id), label: r.label, company_id: String(r.companyId) })) };
  });

  app.get("/things/:id", { preHandler: [authenticate, requireTenant] }, async (req) => {
    const { id } = req.params as { id: string };
    const row = await scopedRepo(DemoThing).findById(id);
    if (!row) throw AppError.notFound("Thing not found");
    return { id: String(row._id), label: row.label };
  });

  app.post(
    "/things",
    {
      preHandler: [authenticate, requireTenant, requirePermission("ratecard:write")],
      schema: { body: z.object({ label: z.string(), companyId: z.string().optional() }) },
    },
    async (req, reply) => {
      // NOTE: body intentionally allows `companyId` so the test can prove it is ignored.
      const created = await scopedRepo(DemoThing).create(req.body as Record<string, unknown>);
      return reply.code(201).send({ id: String(created._id), company_id: String(created.companyId), label: created.label });
    },
  );
}
