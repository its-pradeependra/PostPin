# Changelog

All notable changes to `@postpin/node` are documented here. This project adheres to [Semantic Versioning](https://semver.org).

## [0.1.0] — Unreleased

Initial release.

### Added
- `Postpin` client with API-key authentication.
- `rates.calculate()` — shipping-rate calculation between Indian pincodes.
- `serviceability.check()` — pincode serviceability lookup.
- `pincodes.get()` and `pincodes.states()` — pincode directory access.
- `plans.list()` — public subscription plans.
- Typed error hierarchy: `PostpinError`, `AuthenticationError`, `PermissionError`, `ValidationError`, `NotFoundError`, `QuotaExceededError`, `RateLimitError`, `ApiError`, `ConnectionError`, `TimeoutError`, `SignatureVerificationError`.
- Automatic retries with exponential backoff + full jitter, `Retry-After` support, and per-request timeouts.
- Idempotency keys (auto-generated for POST, overridable per request).
- Request cancellation via `AbortSignal`.
- Webhook signature verification: `Postpin.webhooks.verify()` and `constructEvent()` — constant-time HMAC-SHA256 with timestamp/replay protection.
- Zero runtime dependencies; dual ESM + CommonJS builds; full TypeScript types.
