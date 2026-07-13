# postpin/postpin-php

Official PHP SDK for the [Postpin](https://postpin.in) shipping-rate API — calculate courier charges between Indian pincodes, check serviceability, look up the pincode directory, and verify webhooks.

- **Zero Composer dependencies** — uses `ext-curl` and `ext-json` only.
- **Robust by default** — automatic retries with exponential backoff + jitter, `Retry-After` support, per-request timeouts, and idempotency keys.
- **Typed exceptions** — catch `RateLimitException`, `QuotaExceededException`, `ValidationException`, and friends.
- **Secure webhooks** — constant-time HMAC signature verification with replay protection.
- **Testable** — a `Transport` interface lets you inject a fake HTTP client.

## Requirements

- PHP **8.1+** with `ext-curl` and `ext-json`.

## Install

```bash
composer require postpin/postpin-php
```

## Quick start

```php
<?php
require 'vendor/autoload.php';

use Postpin\Client;

$postpin = new Client(getenv('POSTPIN_API_KEY'));

$rate = $postpin->rates->calculate([
    'origin'      => '400001', // Mumbai
    'destination' => '110001', // New Delhi
    'weight'      => 1200,      // grams
    'service'     => 'express', // "surface" | "express" | "same_day"
]);

echo $rate['total'] . ' ' . $rate['currency']; // 254.38 INR
print_r($rate['etaDays']);                      // [1, 3]
```

> Load your API key from the environment — never hard-code it.

## Configuration

```php
$postpin = new Client($apiKey, [
    'base_url'    => 'https://api.postpin.in/v1', // override the API base (incl. version)
    'timeout'     => 30.0,                         // per-request timeout in seconds
    'max_retries' => 2,                            // retries on 429/5xx/network errors
    'headers'     => ['X-Team' => 'logistics'],    // extra headers on every request
]);
```

## Resources

```php
// Rates
$rate = $postpin->rates->calculate([
    'origin' => '400001', 'destination' => '781001', 'weight' => 2500,
    'length' => 30, 'width' => 20, 'height' => 15,  // cm — enables volumetric weight
    'cod' => true, 'declared_value' => 4999,        // rupees
    'idempotency_key' => 'order-8f3a-rate',         // optional; auto-generated otherwise
]);

// Serviceability
$check = $postpin->serviceability->check('781001');

// Pincodes
$pin    = $postpin->pincodes->get('302001');
$states = $postpin->pincodes->states();

// Plans
$plans = $postpin->plans->list();
```

Each method returns an associative array decoded from the API response.

## Error handling

Every failure throws a subclass of `Postpin\Exception\PostpinException`:

```php
use Postpin\Exception\RateLimitException;
use Postpin\Exception\QuotaExceededException;
use Postpin\Exception\ValidationException;
use Postpin\Exception\AuthenticationException;

try {
    $postpin->rates->calculate([...]);
} catch (RateLimitException $e) {
    echo "Rate limited — retry after {$e->retryAfter}s";
} catch (QuotaExceededException $e) {
    echo "Monthly quota exhausted — upgrade your plan";
} catch (ValidationException $e) {
    echo "Bad request: {$e->getMessage()}";
    var_dump($e->details);
} catch (AuthenticationException $e) {
    echo "Invalid API key";
}
```

| Exception | HTTP | When |
| --- | --- | --- |
| `AuthenticationException` | 401 | Missing or invalid API key |
| `PermissionException` | 403 | Key lacks the required scope |
| `ValidationException` | 400 / 422 | Invalid parameters (`$e->details`) |
| `NotFoundException` | 404 | Resource does not exist |
| `QuotaExceededException` | 402 | Monthly quota used up |
| `RateLimitException` | 429 | Too many requests (`$e->retryAfter`) |
| `ApiException` | 5xx | Server-side error (auto-retried) |
| `TimeoutException` | — | Request exceeded the timeout |
| `ConnectionException` | — | Network failure after retries |

Every `PostpinException` exposes `$errorCode`, `$statusCode`, `$requestId`, `$details`, and `$headers`.

## Webhooks

Verify against the **raw request body** — re-serializing the JSON breaks the signature.

```php
use Postpin\Webhooks;
use Postpin\Exception\SignatureVerificationException;

$payload = file_get_contents('php://input');
$sig     = $_SERVER['HTTP_X_POSTPIN_SIGNATURE'] ?? null;

try {
    $event = Webhooks::constructEvent($payload, $sig, getenv('POSTPIN_WEBHOOK_SECRET'));
} catch (SignatureVerificationException $e) {
    http_response_code(400);
    exit;
}

if ($event['event'] === 'rate.calculated') {
    // handle $event['data']
}
http_response_code(200);
```

`verify()` returns `true` or throws; `constructEvent()` verifies and returns the parsed event array. Both accept a `$toleranceSeconds` argument (default 300; `0` disables the replay check).

## License

MIT © Postpin
