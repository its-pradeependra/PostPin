import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import mongoose from "mongoose";
import { ulid } from "ulid";
import { HEADER } from "@/config/constants.js";
import { env, isTest } from "@/config/env.js";
import { startContext } from "@/context/request-context.js";
import { registerErrorHandler } from "@/lib/errors.js";
import { getJwks } from "@/lib/jwt.js";
import { logger } from "@/lib/logger.js";
import { adminRoutes } from "@/routes/admin.routes.js";
import { authRoutes } from "@/routes/auth.routes.js";
import { billingRoutes } from "@/routes/billing.routes.js";
import { demoRoutes } from "@/routes/demo.routes.js";
import { keysRoutes } from "@/routes/keys.routes.js";
import { membersRoutes } from "@/routes/members.routes.js";
import { notificationsRoutes } from "@/routes/notifications.routes.js";
import { publicRoutes } from "@/routes/public.routes.js";
import { rateCardsRoutes } from "@/routes/rate-cards.routes.js";
import { ratesRoutes } from "@/routes/rates.routes.js";
import { subscriptionRoutes } from "@/routes/subscription.routes.js";
import { ticketsRoutes } from "@/routes/tickets.routes.js";
import { usageRoutes } from "@/routes/usage.routes.js";
import { webhooksRoutes } from "@/routes/webhooks.routes.js";

const DB_STATES: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized",
};

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: (req) => (req.headers[HEADER.requestId] as string) || ulid(),
    trustProxy: true,
    // Above the 5MB zod cap on CSV imports (Fastify's default 1MiB would win otherwise).
    bodyLimit: 8 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "Idempotency-Key", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
  });
  await app.register(cookie);
  await app.register(sensible);
  // Per-route configs (config.rateLimit) become harmless no-ops when the plugin is absent.
  if (!isTest) {
    await app.register(rateLimit, { max: 300, timeWindow: "1 minute", global: false });
  }

  // Treat an empty JSON body as {} so POSTs with no body (e.g. /keys/:id/revoke)
  // don't 400 when a client still sends `Content-Type: application/json`.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    // Keep the raw JSON so webhook signatures (Razorpay etc.) can be verified byte-for-byte.
    (req as typeof req & { rawBody?: string }).rawBody = body as string;
    if (body === "" || body == null) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch {
      const err = new Error("Invalid JSON body") as Error & { statusCode?: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Establish a fresh per-request context at the async root (before any auth).
  app.addHook("onRequest", async (req) => {
    startContext({
      requestId: String(req.id),
      ip: req.ip,
      userAgent: String(req.headers["user-agent"] ?? ""),
    });
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header(HEADER.requestId, req.id);
  });

  registerErrorHandler(app);

  app.get("/health", async () => ({
    status: "ok",
    db: DB_STATES[mongoose.connection.readyState] ?? "unknown",
    version: env.NODE_ENV,
  }));

  app.get("/.well-known/jwks.json", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return getJwks();
  });

  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(publicRoutes, { prefix: "/v1/public" });
  await app.register(keysRoutes, { prefix: "/v1/keys" });
  await app.register(ratesRoutes, { prefix: "/v1/rates" });
  await app.register(usageRoutes, { prefix: "/v1/usage" });
  await app.register(subscriptionRoutes, { prefix: "/v1/subscription" });
  await app.register(webhooksRoutes, { prefix: "/v1/webhooks" });
  await app.register(rateCardsRoutes, { prefix: "/v1/rate-cards" });
  await app.register(ticketsRoutes, { prefix: "/v1/tickets" });
  await app.register(notificationsRoutes, { prefix: "/v1/notifications" });
  await app.register(membersRoutes, { prefix: "/v1/members" });
  await app.register(billingRoutes, { prefix: "/v1/billing" });
  await app.register(adminRoutes, { prefix: "/v1/admin" });
  if (env.NODE_ENV !== "production") {
    await app.register(demoRoutes, { prefix: "/v1/_demo" });
  }

  return app;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;
