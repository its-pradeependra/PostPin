import type { FastifyReply, FastifyRequest } from "fastify";
import { Types } from "mongoose";
import { setContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import { verifyAccessToken } from "@/lib/jwt.js";
import { UserModel } from "@/models/index.js";
import { resolveRolePerms } from "@/services/rbac.service.js";

/** Verify the Bearer access token, check freshness, and establish the request context. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) throw AppError.unauthorized();
  const token = header.slice(7);

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    throw AppError.unauthorized("Invalid or expired token");
  }

  let userId: Types.ObjectId;
  try {
    userId = new Types.ObjectId(claims.sub);
  } catch {
    throw AppError.unauthorized();
  }

  const user = await UserModel.findById(userId)
    .select("permVersion roleId companyId isPlatformStaff status")
    .lean();
  if (!user || user.status === "suspended" || user.status === "disabled") {
    throw AppError.unauthorized();
  }
  if (user.permVersion !== claims.permVersion) {
    throw new AppError("token_stale", "Token is stale — please refresh", 401);
  }

  const { permissions } = await resolveRolePerms(user.roleId);
  setContext({
    userId,
    companyId: user.companyId ?? null,
    roleKey: claims.role,
    isPlatformStaff: user.isPlatformStaff,
    permissions: new Set(permissions),
    permVersion: user.permVersion,
    sessionId: claims.sid ?? null,
  });
}
