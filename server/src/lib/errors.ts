import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { isProd } from "@/config/env.js";

export type ErrorCode =
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "email_unverified"
  | "account_locked"
  | "token_stale"
  | "csrf_failed"
  | "refresh_reuse"
  | "scoped_repo_requires_tenant"
  | "tenant_body_injection"
  | "internal_error";

/** Application error → mapped to the standard response envelope. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode | string;
  readonly details?: unknown;

  constructor(code: ErrorCode | string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message = "Bad request", code: ErrorCode | string = "validation_error", details?: unknown) {
    return new AppError(code, message, 400, details);
  }
  static unauthorized(message = "Authentication required", code: ErrorCode | string = "unauthenticated") {
    return new AppError(code, message, 401);
  }
  static forbidden(message = "You do not have permission to do that", code: ErrorCode | string = "forbidden") {
    return new AppError(code, message, 403);
  }
  static notFound(message = "Not found") {
    return new AppError("not_found", message, 404);
  }
  static conflict(message = "Already exists", code: ErrorCode | string = "conflict") {
    return new AppError(code, message, 409);
  }
}

type Envelope = {
  error: { code: string; message: string; request_id: string; details?: unknown };
};

function envelope(code: string, message: string, requestId: string, details?: unknown): Envelope {
  return { error: { code, message, request_id: requestId, ...(details ? { details } : {}) } };
}

/** Registers the global error handler that renders the standard envelope. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerErrorHandler(app: FastifyInstance<any, any, any, any, any>) {
  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    const requestId = req.id as string;

    if (err instanceof AppError) {
      if (err.statusCode >= 500) req.log.error({ err }, err.message);
      return reply.status(err.statusCode).send(envelope(err.code, err.message, requestId, err.details));
    }

    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return reply.status(400).send(envelope("validation_error", "Request validation failed", requestId, details));
    }

    // Mongoose duplicate key
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      return reply.status(409).send(envelope("conflict", "Resource already exists", requestId));
    }
    if (err instanceof mongoose.Error.ValidationError) {
      const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
      return reply.status(400).send(envelope("validation_error", "Document validation failed", requestId, details));
    }

    // Fastify validation (schema) errors carry .validation
    const fe = err as { statusCode?: number; validation?: unknown; message?: string };
    if (fe.validation) {
      return reply.status(400).send(envelope("validation_error", fe.message ?? "Invalid request", requestId, fe.validation));
    }
    if (fe.statusCode && fe.statusCode < 500) {
      return reply.status(fe.statusCode).send(envelope("error", fe.message ?? "Request error", requestId));
    }

    req.log.error({ err }, "Unhandled error");
    return reply
      .status(500)
      .send(envelope("internal_error", isProd ? "Something went wrong" : String((err as Error)?.message ?? err), requestId));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(envelope("not_found", `Route ${req.method} ${req.url} not found`, req.id as string));
  });
}
