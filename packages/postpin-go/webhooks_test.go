package postpin

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"testing"
	"time"
)

const webhookSecret = "whsec_test_secret"

const nowUnix int64 = 1_718_900_000

var webhookPayload = `{"id":"evt_1","event":"rate.calculated","created":"2026-07-01T00:00:00Z","data":{"total":254.38}}`

func sign(payload string, ts int64, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(ts, 10) + "."))
	mac.Write([]byte(payload))
	return fmt.Sprintf("t=%d,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

func atNow() *WebhookVerifyOptions { return &WebhookVerifyOptions{Now: time.Unix(nowUnix, 0)} }

func TestVerifyValidSignature(t *testing.T) {
	if err := VerifyWebhook([]byte(webhookPayload), sign(webhookPayload, nowUnix, webhookSecret), webhookSecret, atNow()); err != nil {
		t.Fatalf("expected valid, got %v", err)
	}
}

func TestVerifyRejectsTamperedPayload(t *testing.T) {
	err := VerifyWebhook([]byte(webhookPayload+" "), sign(webhookPayload, nowUnix, webhookSecret), webhookSecret, atNow())
	if !IsSignatureError(err) {
		t.Fatalf("expected signature error, got %v", err)
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	err := VerifyWebhook([]byte(webhookPayload), sign(webhookPayload, nowUnix, "whsec_wrong"), webhookSecret, atNow())
	var se *SignatureError
	if !IsSignatureError(err) {
		t.Fatalf("expected signature error, got %v", err)
	}
	se, _ = err.(*SignatureError)
	if se.Code != "signature_mismatch" {
		t.Fatalf("code = %q, want signature_mismatch", se.Code)
	}
}

func TestVerifyRejectsStaleTimestamp(t *testing.T) {
	err := VerifyWebhook([]byte(webhookPayload), sign(webhookPayload, nowUnix-10_000, webhookSecret), webhookSecret, atNow())
	se, ok := err.(*SignatureError)
	if !ok || se.Code != "signature_timestamp" {
		t.Fatalf("expected signature_timestamp, got %v", err)
	}
}

func TestVerifyAllowsStaleWhenToleranceDisabled(t *testing.T) {
	opts := &WebhookVerifyOptions{Now: time.Unix(nowUnix, 0), Tolerance: -1}
	if err := VerifyWebhook([]byte(webhookPayload), sign(webhookPayload, nowUnix-10_000, webhookSecret), webhookSecret, opts); err != nil {
		t.Fatalf("expected valid with tolerance disabled, got %v", err)
	}
}

func TestVerifyRejectsMissingAndMalformed(t *testing.T) {
	if err := VerifyWebhook([]byte(webhookPayload), "", webhookSecret, nil); err == nil {
		t.Fatal("expected error for missing header")
	} else if se, _ := err.(*SignatureError); se.Code != "signature_missing" {
		t.Fatalf("code = %q, want signature_missing", se.Code)
	}
	if err := VerifyWebhook([]byte(webhookPayload), "garbage", webhookSecret, nil); err == nil {
		t.Fatal("expected error for malformed header")
	} else if se, _ := err.(*SignatureError); se.Code != "signature_malformed" {
		t.Fatalf("code = %q, want signature_malformed", se.Code)
	}
}

func TestConstructEvent(t *testing.T) {
	event, err := ConstructEvent([]byte(webhookPayload), sign(webhookPayload, nowUnix, webhookSecret), webhookSecret, atNow())
	if err != nil {
		t.Fatalf("ConstructEvent: %v", err)
	}
	if event.ID != "evt_1" || event.Event != "rate.calculated" {
		t.Fatalf("unexpected event: %+v", event)
	}
	var data struct {
		Total float64 `json:"total"`
	}
	if err := json.Unmarshal(event.Data, &data); err != nil || data.Total != 254.38 {
		t.Fatalf("unexpected data: %v %+v", err, data)
	}
}

func TestConstructEventVerifiesFirst(t *testing.T) {
	_, err := ConstructEvent([]byte(webhookPayload), sign(webhookPayload, nowUnix, "nope"), webhookSecret, atNow())
	if !IsSignatureError(err) {
		t.Fatalf("expected signature error, got %v", err)
	}
}
