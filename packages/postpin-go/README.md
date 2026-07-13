# postpin-go

[![Go Reference](https://pkg.go.dev/badge/github.com/its-pradeependra/postpin-go.svg)](https://pkg.go.dev/github.com/its-pradeependra/postpin-go)
[![Go Report Card](https://goreportcard.com/badge/github.com/its-pradeependra/postpin-go)](https://goreportcard.com/report/github.com/its-pradeependra/postpin-go)

Official Go SDK for the [Postpin](https://postpin.in) shipping-rate API — calculate courier charges between Indian pincodes, check serviceability, look up the pincode directory, and verify webhooks.

- **Zero dependencies** — standard library only.
- **Idiomatic** — `context.Context` on every call, functional options, typed results.
- **Robust by default** — automatic retries with exponential backoff + jitter, `Retry-After` support, per-request timeouts, and idempotency keys.
- **Typed errors** — classify failures with `IsRateLimit`, `IsValidation`, `IsQuotaExceeded`, …
- **Secure webhooks** — constant-time HMAC signature verification with replay protection.

## Requirements

- Go **1.21+**

## Install

```bash
go get github.com/its-pradeependra/postpin-go
```

## Quick start

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/its-pradeependra/postpin-go"
)

func main() {
	client, err := postpin.New(os.Getenv("POSTPIN_API_KEY"))
	if err != nil {
		log.Fatal(err)
	}

	rate, err := client.Rates.Calculate(context.Background(), postpin.RateParams{
		Origin:      "400001", // Mumbai
		Destination: "110001", // New Delhi
		Weight:      1200,      // grams
		Service:     postpin.ServiceExpress,
	})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(rate.Total, rate.Currency) // 254.38 INR
	fmt.Println(rate.ETADays)              // [1 3]
}
```

> Load your API key from the environment — never hard-code it.

## Configuration

```go
client, err := postpin.New(apiKey,
	postpin.WithBaseURL("https://api.postpin.in/v1"),
	postpin.WithTimeout(30*time.Second),
	postpin.WithMaxRetries(2),
	postpin.WithHeader("X-Team", "logistics"),
	postpin.WithHTTPClient(customHTTPClient),
)
```

## Resources

```go
ctx := context.Background()

// Rates (optional fields are pointers; helpers omitted for brevity)
length := 30.0
rate, err := client.Rates.Calculate(ctx, postpin.RateParams{
	Origin: "400001", Destination: "781001", Weight: 2500,
	Length: &length, COD: true,
})

// Serviceability
check, err := client.Serviceability.Check(ctx, "781001")

// Pincodes
pin, err := client.Pincodes.Get(ctx, "302001")
states, err := client.Pincodes.States(ctx)

// Plans
plans, err := client.Plans.List(ctx)
```

Set `RateParams.IdempotencyKey` to override the auto-generated key. Per-request timeouts and cancellation flow through the `context.Context` you pass.

## Error handling

Every API call returns a `*postpin.Error`. Classify it with the `Is*` helpers:

```go
rate, err := client.Rates.Calculate(ctx, params)
if err != nil {
	switch {
	case postpin.IsRateLimit(err):
		var e *postpin.Error
		errors.As(err, &e)
		log.Printf("rate limited — retry after %vs", e.RetryAfter)
	case postpin.IsQuotaExceeded(err):
		log.Println("monthly quota exhausted")
	case postpin.IsValidation(err):
		log.Println("bad request:", err)
	case postpin.IsAuthentication(err):
		log.Println("invalid API key")
	default:
		log.Fatal(err)
	}
}
```

| Helper | HTTP | When |
| --- | --- | --- |
| `IsAuthentication` | 401 | Missing or invalid API key |
| `IsPermission` | 403 | Key lacks the required scope |
| `IsValidation` | 400 / 422 | Invalid parameters |
| `IsNotFound` | 404 | Resource does not exist |
| `IsQuotaExceeded` | 402 | Monthly quota used up |
| `IsRateLimit` | 429 | Too many requests (`Error.RetryAfter`) |
| `IsAPIError` | 5xx | Server-side error (auto-retried) |
| `IsTimeout` | — | Request exceeded the timeout |
| `IsConnection` | — | Network failure after retries |

`*postpin.Error` carries `Type`, `Code`, `Message`, `StatusCode`, `RequestID`, `Details`, and `Header`.

## Webhooks

Verify against the **raw request body** — re-serializing the JSON breaks the signature.

```go
func handleWebhook(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	event, err := postpin.ConstructEvent(
		body,
		r.Header.Get("X-Postpin-Signature"),
		os.Getenv("POSTPIN_WEBHOOK_SECRET"),
		nil, // default 5-minute replay tolerance
	)
	if err != nil {
		http.Error(w, "bad signature", http.StatusBadRequest)
		return
	}

	switch event.Event {
	case "rate.calculated":
		// json.Unmarshal(event.Data, &yourStruct)
	}
	w.WriteHeader(http.StatusOK)
}
```

`VerifyWebhook` returns `nil` or a `*SignatureError`; `ConstructEvent` verifies and returns the parsed `*WebhookEvent`. Pass `&WebhookVerifyOptions{Tolerance: ...}` to change the replay window (a negative value disables it).

## License

MIT © Postpin
