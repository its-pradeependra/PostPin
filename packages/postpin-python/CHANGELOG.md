# Changelog

All notable changes to the `postpin` Python SDK are documented here. This project adheres to [Semantic Versioning](https://semver.org).

## [0.1.0] — Unreleased

Initial release.

### Added
- `Postpin` client with API-key authentication (usable as a context manager).
- `rates.calculate()` — shipping-rate calculation between Indian pincodes.
- `serviceability.check()` — pincode serviceability lookup.
- `pincodes.get()` and `pincodes.states()` — pincode directory access.
- `plans.list()` — public subscription plans.
- Typed dataclass results (`RateResult`, `Serviceability`, `Pincode`, `StateSummary`, `Plan`) with the full payload preserved on `.raw`.
- Typed error hierarchy: `PostpinError`, `AuthenticationError`, `PermissionDeniedError`, `ValidationError`, `NotFoundError`, `QuotaExceededError`, `RateLimitError`, `APIError`, `APIConnectionError`, `APITimeoutError`, `SignatureVerificationError`.
- Automatic retries with exponential backoff + full jitter, `Retry-After` support, and per-request timeouts.
- Idempotency keys (auto-generated for POST, overridable per request).
- Webhook signature verification: `webhooks.verify()` and `webhooks.construct_event()` — constant-time HMAC-SHA256 with timestamp/replay protection.
- Ships `py.typed` for full static-typing support.
