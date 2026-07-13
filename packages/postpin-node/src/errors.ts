/**
 * Typed error hierarchy. Every failed request throws a subclass of
 * `PostpinError`, so callers can `catch` broadly or narrow with `instanceof`.
 * The API's error envelope is `{ error: { code, message, request_id, details } }`.
 */

export interface PostpinErrorOptions {
  code?: string;
  statusCode?: number;
  requestId?: string;
  details?: unknown;
  headers?: Record<string, string>;
  cause?: unknown;
}

/** Base class for every error the SDK throws. */
export class PostpinError extends Error {
  /** Machine-readable code from the API envelope (e.g. "quota_exceeded"). */
  readonly code?: string;
  /** HTTP status, when the failure came from a response. */
  readonly statusCode?: number;
  /** Correlate with server logs / support. */
  readonly requestId?: string;
  /** Structured validation details, when present. */
  readonly details?: unknown;
  /** Response headers (lower-cased keys), when available. */
  readonly headers?: Record<string, string>;

  constructor(message: string, opts: PostpinErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.requestId = opts.requestId;
    this.details = opts.details;
    this.headers = opts.headers;
    // Restore prototype chain for reliable instanceof across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 — missing / invalid / revoked API key. */
export class AuthenticationError extends PostpinError {}

/** 403 — authenticated but not allowed. */
export class PermissionError extends PostpinError {}

/** 400 / 422 — invalid request parameters. */
export class ValidationError extends PostpinError {}

/** 404 — resource not found (e.g. unknown pincode). */
export class NotFoundError extends PostpinError {}

/** 402 — monthly quota exhausted; upgrade the plan. */
export class QuotaExceededError extends PostpinError {}

/** 429 — rate limited. Inspect {@link RateLimitError.retryAfter}. */
export class RateLimitError extends PostpinError {
  /** Seconds to wait before retrying, from the `Retry-After` header (if sent). */
  readonly retryAfter?: number;
  constructor(message: string, opts: PostpinErrorOptions & { retryAfter?: number } = {}) {
    super(message, opts);
    this.retryAfter = opts.retryAfter;
  }
}

/** 5xx — server-side error. */
export class ApiError extends PostpinError {}

/** Network failure — DNS, connection refused, TLS, etc. (no HTTP response). */
export class ConnectionError extends PostpinError {}

/** The request exceeded the configured timeout (aborted client-side). */
export class TimeoutError extends PostpinError {}

/** Webhook signature verification failed (bad signature / expired / malformed). */
export class SignatureVerificationError extends PostpinError {}

interface Envelope {
  error?: { code?: string; message?: string; request_id?: string; details?: unknown };
}

/**
 * Map an HTTP response + parsed body to the right error subclass.
 * @internal
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  headers: Record<string, string>,
): PostpinError {
  const env = (body ?? {}) as Envelope;
  const code = env.error?.code;
  const message =
    env.error?.message ||
    (typeof body === "string" && body ? body : `Postpin API error (HTTP ${status})`);
  const requestId = env.error?.request_id ?? headers["x-request-id"];
  const details = env.error?.details;
  const base: PostpinErrorOptions = { code, statusCode: status, requestId, details, headers };

  switch (status) {
    case 400:
    case 422:
      return new ValidationError(message, base);
    case 401:
      return new AuthenticationError(message, base);
    case 402:
      return new QuotaExceededError(message, base);
    case 403:
      return new PermissionError(message, base);
    case 404:
      return new NotFoundError(message, base);
    case 429: {
      const ra = Number(headers["retry-after"]);
      return new RateLimitError(message, {
        ...base,
        retryAfter: Number.isFinite(ra) ? ra : undefined,
      });
    }
    default:
      if (status >= 500) return new ApiError(message, base);
      return new PostpinError(message, base);
  }
}
