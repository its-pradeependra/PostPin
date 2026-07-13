/**
 * @postpin/node — official Node.js & TypeScript SDK for the Postpin
 * shipping-rate API. https://postpin.in
 */

export { Postpin } from "./client.js";
export { VERSION } from "./version.js";

// Client configuration
export type { ClientOptions, FetchLike } from "./http.js";

// Webhook helpers (also available as Postpin.webhooks.*)
export * as webhooks from "./webhooks.js";
export type { VerifyOptions } from "./webhooks.js";

// Errors
export {
  PostpinError,
  AuthenticationError,
  PermissionError,
  ValidationError,
  NotFoundError,
  QuotaExceededError,
  RateLimitError,
  ApiError,
  ConnectionError,
  TimeoutError,
  SignatureVerificationError,
} from "./errors.js";

// Types
export type {
  ServiceLevel,
  RequestOptions,
  ResponseMeta,
  RateCalculateParams,
  RateBreakdownLine,
  RateResult,
  Serviceability,
  Pincode,
  PincodeNearby,
  StateSummary,
  Plan,
  WebhookEvent,
  WebhookEventType,
} from "./types.js";
