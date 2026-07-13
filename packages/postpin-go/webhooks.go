package postpin

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// DefaultWebhookTolerance is the allowed clock skew for webhook timestamps.
const DefaultWebhookTolerance = 300 * time.Second

// WebhookVerifyOptions tunes signature verification.
type WebhookVerifyOptions struct {
	// Tolerance rejects signatures whose timestamp is older/newer than this.
	// Zero uses DefaultWebhookTolerance; a negative value disables the check.
	Tolerance time.Duration
	// Now overrides the current time (for testing). Zero uses time.Now().
	Now time.Time
}

// WebhookEvent is a parsed Postpin webhook event.
type WebhookEvent struct {
	ID      string          `json:"id"`
	Event   string          `json:"event"`
	Created string          `json:"created"`
	Data    json.RawMessage `json:"data"`
}

// VerifyWebhook verifies a webhook signature against the RAW request body.
// It returns nil on success or a *SignatureError on any failure.
//
// Always pass the raw body bytes — re-serializing the JSON breaks the signature.
func VerifyWebhook(payload []byte, signatureHeader, secret string, opts *WebhookVerifyOptions) error {
	if signatureHeader == "" {
		return &SignatureError{Code: "signature_missing", Message: "missing Postpin signature header"}
	}
	if secret == "" {
		return &SignatureError{Code: "secret_missing", Message: "a webhook signing secret is required"}
	}

	ts, v1, ok := parseSignatureHeader(signatureHeader)
	if !ok {
		return &SignatureError{Code: "signature_malformed", Message: "malformed Postpin signature header"}
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(ts, 10) + "."))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(v1), []byte(expected)) {
		return &SignatureError{Code: "signature_mismatch", Message: "webhook signature does not match — payload may be forged or the secret is wrong"}
	}

	tolerance := DefaultWebhookTolerance
	if opts != nil && opts.Tolerance != 0 {
		tolerance = opts.Tolerance
	}
	if tolerance > 0 {
		now := time.Now()
		if opts != nil && !opts.Now.IsZero() {
			now = opts.Now
		}
		diff := now.Unix() - ts
		if diff < 0 {
			diff = -diff
		}
		if float64(diff) > tolerance.Seconds() {
			return &SignatureError{Code: "signature_timestamp", Message: fmt.Sprintf("webhook timestamp is outside the allowed tolerance of %s (possible replay)", tolerance)}
		}
	}
	return nil
}

// ConstructEvent verifies the signature and returns the parsed event — the safe
// way to consume a webhook.
func ConstructEvent(payload []byte, signatureHeader, secret string, opts *WebhookVerifyOptions) (*WebhookEvent, error) {
	if err := VerifyWebhook(payload, signatureHeader, secret, opts); err != nil {
		return nil, err
	}
	var event WebhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		return nil, &SignatureError{Code: "invalid_json", Message: "webhook payload is not valid JSON"}
	}
	return &event, nil
}

func parseSignatureHeader(header string) (ts int64, v1 string, ok bool) {
	haveTS := false
	for _, part := range strings.Split(header, ",") {
		eq := strings.IndexByte(part, '=')
		if eq == -1 {
			continue
		}
		key := strings.TrimSpace(part[:eq])
		val := strings.TrimSpace(part[eq+1:])
		switch key {
		case "t":
			n, err := strconv.ParseInt(val, 10, 64)
			if err == nil {
				ts = n
				haveTS = true
			}
		case "v1":
			v1 = val
		}
	}
	return ts, v1, haveTS && v1 != ""
}
