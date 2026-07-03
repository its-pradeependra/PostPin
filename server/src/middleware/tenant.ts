import type { FastifyReply, FastifyRequest } from "fastify";
import { getContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";

/** Tenant-plane guard: the caller must belong to a tenant (not platform staff). */
export async function requireTenant(_req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!getContext().companyId) {
    throw AppError.forbidden("This endpoint requires a tenant account");
  }
}
