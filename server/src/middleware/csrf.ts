import type { FastifyReply, FastifyRequest } from "fastify";
import { COOKIE, HEADER } from "@/config/constants.js";
import { timingSafeEqualStr } from "@/lib/crypto.js";
import { AppError } from "@/lib/errors.js";

/** Double-submit CSRF check for cookie-bearing endpoints (refresh/logout). */
export async function verifyCsrf(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const cookieToken = req.cookies?.[COOKIE.csrf];
  const headerToken = req.headers[HEADER.csrf];
  if (
    !cookieToken ||
    !headerToken ||
    Array.isArray(headerToken) ||
    !timingSafeEqualStr(cookieToken, headerToken)
  ) {
    throw new AppError("csrf_failed", "CSRF validation failed", 403);
  }
}
