# @postpin/node

[![npm version](https://img.shields.io/npm/v/@postpin/node)](https://www.npmjs.com/package/@postpin/node)
[![npm downloads](https://img.shields.io/npm/dm/@postpin/node)](https://www.npmjs.com/package/@postpin/node)
[![license](https://img.shields.io/npm/l/@postpin/node)](./LICENSE)

Official Node.js & TypeScript SDK for the [Postpin](https://postpin.in) shipping-rate API — calculate courier charges between Indian pincodes, check serviceability, look up the pincode directory, and verify webhooks.

- **Zero runtime dependencies** — uses the built-in `fetch` and `node:crypto`.
- **Fully typed** — first-class TypeScript types for every request and response.
- **Robust by default** — automatic retries with exponential backoff + jitter, `Retry-After` support, per-request timeouts, and idempotency keys.
- **Typed errors** — catch `RateLimitError`, `QuotaExceededError`, `ValidationError`, and friends.
- **Dual package** — ships both ESM and CommonJS builds.
- **Secure webhooks** — constant-time HMAC signature verification with replay protection.

## Requirements

- Node.js **18 or newer** (relies on the global `fetch`). On older runtimes, pass a `fetch` implementation via `options.fetch`.

## Install

```bash
npm install @postpin/node
# or
pnpm add @postpin/node
# or
yarn add @postpin/node
```

## Quick start

```ts
import { Postpin } from "@postpin/node";

const postpin = new Postpin(process.env.POSTPIN_API_KEY!);

const rate = await postpin.rates.calculate({
  origin: "400001",       // Mumbai
  destination: "110001",  // New Delhi
  weight: 1200,           // grams
  service: "express",     // "surface" | "express" | "same_day"
});

console.log(rate.total, rate.currency);   // 254.38 INR
console.log(rate.etaDays);                // [1, 3]
console.log(rate.breakdown);              // [{ label: "Base charge", amount: 88 }, ...]
```

> Your API key is a secret. Load it from an environment variable — never hard-code it or ship it to the browser.

## Configuration

```ts
const postpin = new Postpin(apiKey, {
  baseUrl: "https://api.postpin.in/v1", // override the API base (incl. version)
  timeout: 30_000,                      // per-request timeout in ms (default 30s)
  maxRetries: 2,                        // retries on 429/5xx/network errors (default 2)
  headers: { "x-team": "logistics" },   // extra headers on every request
  fetch: customFetch,                   // inject a custom fetch (proxy, Node <18, tests)
});
```

## Resources

### Rates

```ts
const rate = await postpin.rates.calculate({
  origin: "400001",
  destination: "781001",
  weight: 2500,          // grams
  length: 30,            // cm (optional — enables volumetric weight)
  width: 20,
  height: 15,
  service: "surface",
  cod: true,             // cash on delivery
  declaredValue: 4999,   // rupees, for insurance/COD
});
```

### Serviceability

```ts
const check = await postpin.serviceability.check("781001");
// { pincode: "781001", serviceable: true, found: true, city: "Guwahati", state: "Assam" }
```

### Pincodes

```ts
const pin = await postpin.pincodes.get("302001");
// { pincode, city, state, district, is_metro, is_remote, nearby: [...] }

const states = await postpin.pincodes.states();
// [{ state: "Rajasthan", slug: "rajasthan", count: 100, metros: 0 }, ...]
```

### Plans

```ts
const plans = await postpin.plans.list();
```

## Per-request options

Every method accepts an optional second argument:

```ts
const controller = new AbortController();

await postpin.rates.calculate(params, {
  signal: controller.signal,        // cancel the request
  idempotencyKey: "order-8f3a-rate" // dedupe retried POSTs (auto-generated otherwise)
});
```

## Error handling

Every failure throws a subclass of `PostpinError`, so you can branch on type:

```ts
import {
  Postpin,
  RateLimitError,
  QuotaExceededError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
} from "@postpin/node";

try {
  await postpin.rates.calculate(params);
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Rate limited — retry after ${err.retryAfter}s`);
  } else if (err instanceof QuotaExceededError) {
    console.log("Monthly quota exhausted — upgrade your plan");
  } else if (err instanceof ValidationError) {
    console.log("Bad request:", err.message, err.details);
  } else if (err instanceof AuthenticationError) {
    console.log("Invalid API key");
  } else if (err instanceof NotFoundError) {
    console.log("Not found");
  } else {
    throw err;
  }
}
```

| Error | HTTP | When |
| --- | --- | --- |
| `AuthenticationError` | 401 | Missing or invalid API key |
| `PermissionError` | 403 | Key lacks the required scope |
| `ValidationError` | 400 / 422 | Invalid parameters (`err.details`) |
| `NotFoundError` | 404 | Resource does not exist |
| `QuotaExceededError` | 402 | Monthly quota used up |
| `RateLimitError` | 429 | Too many requests (`err.retryAfter`) |
| `ApiError` | 5xx | Server-side error (auto-retried) |
| `TimeoutError` | — | Request exceeded `timeout` |
| `ConnectionError` | — | Network failure after retries |

Every `PostpinError` carries `code`, `statusCode`, `requestId`, `details`, and `headers` for logging and support.

## Automatic retries

Requests that fail with `408, 409, 425, 429, 500, 502, 503, 504` or a network error are retried up to `maxRetries` times with exponential backoff and full jitter. A `Retry-After` header is always honored. `GET`s are safe to retry; `POST`s carry an idempotency key so retries never double-charge.

## Webhooks

Verify inbound webhooks against the **raw request body** — re-serializing the JSON changes the bytes and breaks the signature.

```ts
import { Postpin, SignatureVerificationError } from "@postpin/node";

// Express (raw body required)
app.post("/webhooks/postpin", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const event = Postpin.webhooks.constructEvent(
      req.body,                            // raw Buffer
      req.headers["x-postpin-signature"],
      process.env.POSTPIN_WEBHOOK_SECRET!,
    );

    switch (event.event) {
      case "rate.calculated":
        // handle event.data
        break;
    }
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof SignatureVerificationError) return res.sendStatus(400);
    throw err;
  }
});
```

`verify()` returns `true` or throws; `constructEvent()` verifies and returns the parsed, typed event. Both accept `{ toleranceSeconds }` (default 300s replay window; `0` disables) and reject stale timestamps.

## TypeScript

Everything is typed. Import types directly:

```ts
import type { RateResult, RateCalculateParams, ServiceLevel, WebhookEvent } from "@postpin/node";
```

## License

MIT © Postpin
