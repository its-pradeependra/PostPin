# Changelog

All notable changes to the `postpin-go` SDK are documented here. This project adheres to [Semantic Versioning](https://semver.org).

## [0.1.0] — Unreleased

Initial release.

### Added
- `Client` created with `New(apiKey, ...Option)`; functional options `WithBaseURL`, `WithHTTPClient`, `WithTimeout`, `WithMaxRetries`, `WithHeader`.
- `Rates.Calculate` — shipping-rate calculation between Indian pincodes.
- `Serviceability.Check` — pincode serviceability lookup.
- `Pincodes.Get` and `Pincodes.States` — pincode directory access.
- `Plans.List` — public subscription plans.
- `context.Context` on every call for cancellation and deadlines.
- Single `*Error` type with `Is*` classification helpers (`IsRateLimit`, `IsValidation`, `IsQuotaExceeded`, `IsAuthentication`, `IsPermission`, `IsNotFound`, `IsAPIError`, `IsTimeout`, `IsConnection`).
- Automatic retries with exponential backoff + full jitter, `Retry-After` support, and per-request timeouts.
- Idempotency keys (auto-generated UUIDv4 for POST, overridable per request).
- Webhook signature verification: `VerifyWebhook` and `ConstructEvent` — constant-time HMAC-SHA256 with timestamp/replay protection.
- Zero third-party dependencies (standard library only).
