import type { FastifyReply, FastifyRequest } from "fastify";
import { getContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";

/** Require at least one of the given permission keys (deny by default). */
export function requirePermission(...keys: string[]) {
  return async function permissionGuard(_req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const perms = getContext().permissions;
    if (!keys.some((k) => perms.has(k))) {
      throw AppError.forbidden();
    }
  };
}
