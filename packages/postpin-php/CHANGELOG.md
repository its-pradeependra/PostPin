# Changelog

All notable changes to the `its-pradeependra/postpin-php` SDK are documented here. This project adheres to [Semantic Versioning](https://semver.org).

## [0.1.0] — Unreleased

Initial release.

### Added
- `Postpin\Client` with API-key authentication and an options array.
- `rates->calculate()` — shipping-rate calculation between Indian pincodes.
- `serviceability->check()` — pincode serviceability lookup.
- `pincodes->get()` and `pincodes->states()` — pincode directory access.
- `plans->list()` — public subscription plans.
- Typed exception hierarchy: `PostpinException`, `AuthenticationException`, `PermissionException`, `ValidationException`, `NotFoundException`, `QuotaExceededException`, `RateLimitException`, `ApiException`, `ConnectionException`, `TimeoutException`, `SignatureVerificationException`.
- Automatic retries with exponential backoff + full jitter, `Retry-After` support, and per-request timeouts.
- Idempotency keys (auto-generated UUIDv4 for POST, overridable per request).
- Webhook signature verification: `Postpin\Webhooks::verify()` and `constructEvent()` — constant-time HMAC-SHA256 with timestamp/replay protection.
- Pluggable `Postpin\Http\Transport` interface (default `CurlTransport`) for testing and custom HTTP stacks.
- Zero Composer dependencies (`ext-curl` + `ext-json` only).
