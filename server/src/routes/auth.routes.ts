import type { FastifyInstance, FastifyReply } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AUTH, COOKIE, REFRESH_COOKIE_PATH } from "@/config/constants.js";
import { env } from "@/config/env.js";
import { getContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import { authenticate } from "@/middleware/authenticate.js";
import { verifyCsrf } from "@/middleware/csrf.js";
import * as auth from "@/services/auth.service.js";
import { recentEmails } from "@/services/email.service.js";
import { listActiveSessions, revokeOtherSessions, revokeSessionById } from "@/services/session.service.js";

/** Best-effort device/browser labels from a User-Agent string (display only). */
function parseUa(uaStr: string): { device: string; browser: string } {
  const browser = /Edg\//.test(uaStr)
    ? "Edge"
    : /OPR\/|Opera/.test(uaStr)
      ? "Opera"
      : /Chrome\//.test(uaStr)
        ? "Chrome"
        : /Firefox\//.test(uaStr)
          ? "Firefox"
          : /Safari\//.test(uaStr)
            ? "Safari"
            : "Browser";
  const device = /iPhone/.test(uaStr)
    ? "iPhone"
    : /iPad/.test(uaStr)
      ? "iPad"
      : /Android/.test(uaStr)
        ? "Android device"
        : /Windows/.test(uaStr)
          ? "Windows PC"
          : /Macintosh|Mac OS/.test(uaStr)
            ? "Mac"
            : /Linux/.test(uaStr)
              ? "Linux"
              : "Device";
  return { device, browser };
}

function baseCookie(expires?: Date) {
  const secure = env.COOKIE_SECURE;
  return {
    secure,
    sameSite: (secure ? "strict" : "lax") as "strict" | "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    expires,
  };
}

function setAuthCookies(reply: FastifyReply, refreshToken: string, csrfToken: string, expires: Date) {
  reply.setCookie(COOKIE.refresh, refreshToken, { ...baseCookie(expires), httpOnly: true, path: REFRESH_COOKIE_PATH });
  reply.setCookie(COOKIE.csrf, csrfToken, { ...baseCookie(expires), httpOnly: false, path: "/" });
}

function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie(COOKIE.refresh, { path: REFRESH_COOKIE_PATH });
  reply.clearCookie(COOKIE.csrf, { path: "/" });
}

const ua = (req: { headers: Record<string, unknown> }) => String(req.headers["user-agent"] ?? "");

export async function authRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/signup",
    {
      schema: {
        body: z.object({
          email: z.string().email(),
          password: z.string().min(AUTH.minPasswordLength),
          name: z.string().min(2).max(120),
          company_name: z.string().min(2).max(120),
          marketing_consent: z.boolean().optional(),
        }),
      },
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const b = req.body;
      const result = await auth.signup({ email: b.email, password: b.password, name: b.name, companyName: b.company_name });
      return reply.code(201).send(result);
    },
  );

  app.post(
    "/verify-email",
    { schema: { body: z.object({ token: z.string().min(10) }) } },
    async (req) => auth.verifyEmail(req.body.token),
  );

  app.post(
    "/verify-email/resend",
    { schema: { body: z.object({ email: z.string().email() }) }, config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (req) => auth.resendVerification(req.body.email),
  );

  app.post(
    "/login",
    { schema: { body: z.object({ email: z.string().email(), password: z.string().min(1) }) }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const r = await auth.login({ email: req.body.email, password: req.body.password, ip: req.ip, userAgent: ua(req) });
      setAuthCookies(reply, r.refreshToken, r.csrfToken, r.refreshExpiresAt);
      return reply.send({ access_token: r.accessToken, token_type: "Bearer", expires_in: r.expiresIn, user: r.user });
    },
  );

  app.post(
    "/refresh",
    { preHandler: [verifyCsrf], config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const rawToken = req.cookies?.[COOKIE.refresh];
      if (!rawToken) throw AppError.unauthorized("No active session", "refresh_invalid");
      const r = await auth.refresh({ rawToken, ip: req.ip, userAgent: ua(req) });
      setAuthCookies(reply, r.refreshToken, r.csrfToken, r.refreshExpiresAt);
      return reply.send({ access_token: r.accessToken, token_type: "Bearer", expires_in: r.expiresIn });
    },
  );

  app.post("/logout", { preHandler: [verifyCsrf] }, async (req, reply) => {
    await auth.logout(req.cookies?.[COOKIE.refresh]);
    clearAuthCookies(reply);
    return reply.code(204).send();
  });

  app.post("/logout-all", { preHandler: [authenticate] }, async (_req, reply) => {
    const ctx = getContext();
    if (ctx.userId) await auth.logoutEverywhere(ctx.userId);
    clearAuthCookies(reply);
    return reply.code(204).send();
  });

  app.post(
    "/forgot-password",
    { schema: { body: z.object({ email: z.string().email() }) }, config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (req) => auth.forgotPassword(req.body.email),
  );

  app.post(
    "/reset-password",
    { schema: { body: z.object({ token: z.string().min(10), new_password: z.string().min(AUTH.minPasswordLength) }) } },
    async (req) => auth.resetPassword({ token: req.body.token, newPassword: req.body.new_password }),
  );

  app.post(
    "/accept-invite",
    {
      schema: { body: z.object({ token: z.string().min(10), name: z.string().min(2).max(120), password: z.string().min(AUTH.minPasswordLength).max(200) }) },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req) => auth.acceptInvite({ token: req.body.token, name: req.body.name, password: req.body.password }),
  );

  app.get("/me", { preHandler: [authenticate] }, async () => {
    const ctx = getContext();
    return auth.getMe(ctx.userId!);
  });

  app.patch(
    "/profile",
    {
      preHandler: [authenticate],
      schema: {
        body: z.object({
          name: z.string().min(2).max(120).optional(),
          locale: z.string().min(2).max(20).optional(),
          timezone: z.string().min(2).max(64).optional(),
        }),
      },
    },
    async (req) => {
      const ctx = getContext();
      return auth.updateProfile(ctx.userId!, req.body);
    },
  );

  app.post(
    "/change-password",
    {
      preHandler: [authenticate],
      schema: { body: z.object({ current_password: z.string().min(1), new_password: z.string().min(AUTH.minPasswordLength).max(200) }) },
    },
    async (req) => {
      const ctx = getContext();
      return auth.changePassword(ctx.userId!, ctx.sessionId ?? "", {
        currentPassword: req.body.current_password,
        newPassword: req.body.new_password,
      });
    },
  );

  app.get("/sessions", { preHandler: [authenticate] }, async () => {
    const ctx = getContext();
    const list = await listActiveSessions(ctx.userId!);
    return {
      sessions: list.map((s) => {
        const { device, browser } = parseUa(s.userAgent ?? "");
        return {
          id: String(s._id),
          device,
          browser,
          location: s.ipCountry ?? "Unknown",
          ip: s.ip ?? "",
          last_active_at: s.lastSeenAt,
          current: String(s._id) === ctx.sessionId,
        };
      }),
    };
  });

  app.post(
    "/sessions/:id/revoke",
    { preHandler: [authenticate], schema: { params: z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) }) } },
    async (req) => {
      const ctx = getContext();
      if (req.params.id === ctx.sessionId) throw AppError.badRequest("You can't revoke the session you're using", "current_session");
      const ok = await revokeSessionById(ctx.userId!, req.params.id);
      if (!ok) throw AppError.notFound("Session not found");
      return { ok: true };
    },
  );

  app.post("/sessions/revoke-others", { preHandler: [authenticate] }, async () => {
    const ctx = getContext();
    const revoked = await revokeOtherSessions(ctx.userId!, ctx.sessionId ?? "");
    return { ok: true, revoked };
  });

  // Dev/test only: read captured emails to extract verify/reset tokens for E2E.
  if (env.NODE_ENV !== "production") {
    app.get("/_dev/emails", async () => ({ emails: recentEmails() }));
  }
}
