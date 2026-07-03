/** Cookie names (kept short, namespaced). */
export const COOKIE = {
  refresh: "pp_rt",
  csrf: "pp_csrf",
} as const;

/** Header names used across the app. */
export const HEADER = {
  requestId: "x-request-id",
  csrf: "x-csrf-token",
  idempotency: "idempotency-key",
} as const;

/** Refresh-cookie path — scoped so it is only sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = "/v1/auth";

/** Auth hardening. */
export const AUTH = {
  maxFailedLogins: 10,
  lockoutMs: 15 * 60 * 1000,
  emailVerifyTtlMs: 24 * 60 * 60 * 1000,
  passwordResetTtlMs: 30 * 60 * 1000,
  minPasswordLength: 12,
} as const;

/** API versioning. */
export const API_VERSION = "v1";
