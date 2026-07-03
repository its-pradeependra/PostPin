import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import { requireTenant } from "@/middleware/tenant.js";
import * as members from "@/services/member.service.js";

const objectId = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id") });
const roleEnum = z.enum(["owner", "developer", "member"]);

export async function membersRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const gate = (perm: string) => [authenticate, requireTenant, requirePermission(perm)];

  app.get("/", { preHandler: gate("member:read") }, async () => members.listMembers());

  app.post(
    "/invite",
    { preHandler: gate("member:write"), schema: { body: z.object({ email: z.string().email(), role: roleEnum }) } },
    async (req, reply) => reply.code(201).send(await members.inviteMember(req.body)),
  );

  app.patch(
    "/:id/role",
    { preHandler: gate("member:role"), schema: { params: objectId, body: z.object({ role: roleEnum }) } },
    async (req) => members.changeMemberRole(req.params.id, req.body.role),
  );

  app.delete("/:id", { preHandler: gate("member:write"), schema: { params: objectId } }, async (req) =>
    members.removeMember(req.params.id),
  );
}
