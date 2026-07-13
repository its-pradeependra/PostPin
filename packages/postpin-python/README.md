# postpin

[![PyPI version](https://img.shields.io/pypi/v/postpin)](https://pypi.org/project/postpin/)
[![Python versions](https://img.shields.io/pypi/pyversions/postpin)](https://pypi.org/project/postpin/)
[![license](https://img.shields.io/pypi/l/postpin)](./LICENSE)

Official Python SDK for the [Postpin](https://postpin.in) shipping-rate API — calculate courier charges between Indian pincodes, check serviceability, look up the pincode directory, and verify webhooks.

- **Fully typed** — dataclass results and typed parameters; ships `py.typed`.
- **Robust by default** — automatic retries with exponential backoff + jitter, `Retry-After` support, per-request timeouts, and idempotency keys.
- **Typed errors** — catch `RateLimitError`, `QuotaExceededError`, `ValidationError`, and friends.
- **Secure webhooks** — constant-time HMAC signature verification with replay protection.

## Requirements

- Python **3.8+**

## Install

```bash
pip install postpin
```

## Quick start

```python
import os
from postpin import Postpin

client = Postpin(os.environ["POSTPIN_API_KEY"])

rate = client.rates.calculate(
    origin="400001",       # Mumbai
    destination="110001",  # New Delhi
    weight=1200,           # grams
    service="express",     # "surface" | "express" | "same_day"
)

print(rate.total, rate.currency)  # 254.38 INR
print(rate.eta_days)              # [1, 3]
for line in rate.breakdown:
    print(line.label, line.amount)
```

> Load your API key from an environment variable — never hard-code it.

The client can be used as a context manager to close the connection pool:

```python
with Postpin(api_key) as client:
    rate = client.rates.calculate(origin="400001", destination="781001", weight=2500)
```

## Configuration

```python
client = Postpin(
    api_key,
    base_url="https://api.postpin.in/v1",  # override the API base (incl. version)
    timeout=30.0,                          # per-request timeout in seconds
    max_retries=2,                         # retries on 429/5xx/network errors
    headers={"x-team": "logistics"},       # extra headers on every request
)
```

## Resources

```python
# Rates
rate = client.rates.calculate(
    origin="400001", destination="781001", weight=2500,
    length=30, width=20, height=15,   # cm — enables volumetric weight
    cod=True, declared_value=4999,    # rupees
)

# Serviceability
check = client.serviceability.check("781001")
print(check.serviceable, check.city)

# Pincodes
pin = client.pincodes.get("302001")
states = client.pincodes.states()

# Plans
plans = client.plans.list()
```

Every method accepts `timeout=`, and `rates.calculate` also accepts `idempotency_key=`.

## Error handling

```python
from postpin import (
    Postpin, RateLimitError, QuotaExceededError,
    ValidationError, AuthenticationError, NotFoundError,
)

try:
    client.rates.calculate(origin="400001", destination="110001", weight=1200)
except RateLimitError as e:
    print(f"Rate limited — retry after {e.retry_after}s")
except QuotaExceededError:
    print("Monthly quota exhausted — upgrade your plan")
except ValidationError as e:
    print("Bad request:", e.message, e.details)
except AuthenticationError:
    print("Invalid API key")
```

| Error | HTTP | When |
| --- | --- | --- |
| `AuthenticationError` | 401 | Missing or invalid API key |
| `PermissionDeniedError` | 403 | Key lacks the required scope |
| `ValidationError` | 400 / 422 | Invalid parameters (`.details`) |
| `NotFoundError` | 404 | Resource does not exist |
| `QuotaExceededError` | 402 | Monthly quota used up |
| `RateLimitError` | 429 | Too many requests (`.retry_after`) |
| `APIError` | 5xx | Server-side error (auto-retried) |
| `APITimeoutError` | — | Request exceeded `timeout` |
| `APIConnectionError` | — | Network failure after retries |

Every `PostpinError` carries `code`, `status_code`, `request_id`, `details`, and `headers`.

## Webhooks

Verify against the **raw request body** — re-serializing the JSON breaks the signature.

```python
from flask import Flask, request
from postpin import webhooks, SignatureVerificationError

app = Flask(__name__)

@app.post("/webhooks/postpin")
def handle():
    try:
        event = webhooks.construct_event(
            request.get_data(),                       # raw bytes
            request.headers.get("X-Postpin-Signature"),
            os.environ["POSTPIN_WEBHOOK_SECRET"],
        )
    except SignatureVerificationError:
        return "", 400

    if event["event"] == "rate.calculated":
        ...  # handle event["data"]
    return "", 200
```

`verify()` returns `True` or raises; `construct_event()` verifies and returns the parsed event. Both accept `tolerance_seconds=` (default 300; `0` disables the replay check).

## License

MIT © Postpin
