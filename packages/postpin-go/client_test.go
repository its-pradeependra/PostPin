package postpin

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const testKey = "pp_test_abc123"

var rateData = map[string]any{
	"zone":                  "metro",
	"zoneLabel":             "Metro",
	"service":               "express",
	"serviceLabel":          "Express",
	"chargeableWeightGrams": 1200,
	"volumetricWeightGrams": 0,
	"etaDays":               []int{1, 3},
	"currency":              "INR",
	"breakdown":             []any{map[string]any{"label": "Base charge", "amount": 88}},
	"total":                 254.38,
	"totalPaise":            25438,
	"origin":                map[string]any{"pincode": "400001", "city": "Mumbai", "state": "Maharashtra"},
	"destination":           map[string]any{"pincode": "110001", "city": "New Delhi", "state": "Delhi"},
	"serviceable":           true,
}

func writeData(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data, "meta": map[string]any{"request_id": "req_1"}})
}

func writeErr(w http.ResponseWriter, status int, code string, headers map[string]string) {
	for k, v := range headers {
		w.Header().Set(k, v)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": code, "message": "boom", "request_id": "req_err"}})
}

func testClient(t *testing.T, handler http.HandlerFunc, opts ...Option) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	base := append([]Option{WithBaseURL(srv.URL), WithMaxRetries(2)}, opts...)
	c, err := New(testKey, base...)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	c.sleep = func(time.Duration) {}
	return c
}

func f64(v float64) *float64 { return &v }

func TestNewRequiresAPIKey(t *testing.T) {
	if _, err := New(""); err == nil {
		t.Fatal("expected error for empty key")
	}
	if _, err := New("   "); err == nil {
		t.Fatal("expected error for whitespace key")
	}
	if _, err := New("pp_x"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRatesCalculate(t *testing.T) {
	var gotReq *http.Request
	var gotBody []byte
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotReq = r
		gotBody, _ = io.ReadAll(r.Body)
		writeData(w, 200, rateData)
	})

	rate, err := c.Rates.Calculate(context.Background(), RateParams{
		Origin: "400001", Destination: "110001", Weight: 1200,
		Service: "express", COD: true, DeclaredValue: f64(1499),
	})
	if err != nil {
		t.Fatalf("Calculate: %v", err)
	}
	if rate.Total != 254.38 || rate.ZoneLabel != "Metro" || rate.Origin.City != "Mumbai" {
		t.Fatalf("unexpected result: %+v", rate)
	}
	if len(rate.ETADays) != 2 || rate.ETADays[0] != 1 {
		t.Fatalf("unexpected etaDays: %v", rate.ETADays)
	}

	if gotReq.URL.Path != "/rates/calculate" || gotReq.Method != http.MethodPost {
		t.Fatalf("unexpected request line: %s %s", gotReq.Method, gotReq.URL.Path)
	}
	if got := gotReq.Header.Get("Authorization"); got != "Bearer "+testKey {
		t.Fatalf("bad auth header: %q", got)
	}
	if !strings.HasPrefix(gotReq.Header.Get("User-Agent"), "postpin-go/") {
		t.Fatalf("bad user-agent: %q", gotReq.Header.Get("User-Agent"))
	}
	if gotReq.Header.Get("Idempotency-Key") == "" {
		t.Fatal("missing auto idempotency key")
	}

	var body map[string]any
	if err := json.Unmarshal(gotBody, &body); err != nil {
		t.Fatalf("bad body json: %v", err)
	}
	if body["origin"] != "400001" || body["weight"].(float64) != 1200 || body["cod"] != true || body["declared_value"].(float64) != 1499 {
		t.Fatalf("unexpected request body: %v", body)
	}
}

func TestExplicitIdempotencyKey(t *testing.T) {
	var got string
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("Idempotency-Key")
		writeData(w, 200, rateData)
	})
	_, err := c.Rates.Calculate(context.Background(), RateParams{Origin: "400001", Destination: "110001", Weight: 500, IdempotencyKey: "my-key"})
	if err != nil {
		t.Fatalf("Calculate: %v", err)
	}
	if got != "my-key" {
		t.Fatalf("idempotency key = %q, want my-key", got)
	}
}

func TestServiceabilityCheck(t *testing.T) {
	var path string
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		writeData(w, 200, map[string]any{"pincode": "781001", "serviceable": true, "found": true, "city": "Guwahati", "state": "Assam"})
	})
	s, err := c.Serviceability.Check(context.Background(), "781001")
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if s.City != "Guwahati" || !s.Serviceable {
		t.Fatalf("unexpected: %+v", s)
	}
	if path != "/public/serviceability/781001" {
		t.Fatalf("bad path: %s", path)
	}
}

func TestPincodesGetAndStates(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/public/pincodes/302001":
			writeData(w, 200, map[string]any{"pincode": "302001", "city": "Jaipur", "state": "Rajasthan", "is_metro": false, "is_remote": false, "serviceable": true, "nearby": []any{}})
		case "/public/pincodes/states":
			writeData(w, 200, []any{map[string]any{"state": "Rajasthan", "slug": "rajasthan", "count": 100, "metros": 0}})
		default:
			http.NotFound(w, r)
		}
	})
	pin, err := c.Pincodes.Get(context.Background(), "302001")
	if err != nil || pin.City != "Jaipur" {
		t.Fatalf("Get: %v %+v", err, pin)
	}
	states, err := c.Pincodes.States(context.Background())
	if err != nil || len(states) != 1 || states[0].Slug != "rajasthan" {
		t.Fatalf("States: %v %+v", err, states)
	}
}

func TestPlansList(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		writeData(w, 200, []any{map[string]any{"code": "free", "name": "Free", "included_calls": 1000}})
	})
	plans, err := c.Plans.List(context.Background())
	if err != nil || len(plans) != 1 || plans[0].Code != "free" || plans[0].IncludedCalls != 1000 {
		t.Fatalf("List: %v %+v", err, plans)
	}
}

func TestErrorMapping(t *testing.T) {
	cases := []struct {
		status int
		code   string
		check  func(error) bool
	}{
		{400, "validation_error", IsValidation},
		{401, "invalid_key", IsAuthentication},
		{402, "quota_exceeded", IsQuotaExceeded},
		{404, "not_found", IsNotFound},
		{500, "internal", IsAPIError},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.code, func(t *testing.T) {
			c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
				writeErr(w, tc.status, tc.code, nil)
			}, WithMaxRetries(0))
			_, err := c.Pincodes.Get(context.Background(), "000000")
			if !tc.check(err) {
				t.Fatalf("predicate failed for %d: %v", tc.status, err)
			}
			var pe *Error
			if !errors.As(err, &pe) {
				t.Fatalf("not a *Error: %v", err)
			}
			if pe.Code != tc.code || pe.StatusCode != tc.status || pe.RequestID != "req_err" {
				t.Fatalf("unexpected error fields: %+v", pe)
			}
		})
	}
}

func TestRateLimitRetryAfter(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, 429, "rate_limited", map[string]string{"Retry-After": "42"})
	}, WithMaxRetries(0))
	_, err := c.Rates.Calculate(context.Background(), RateParams{Origin: "400001", Destination: "110001", Weight: 500})
	if !IsRateLimit(err) {
		t.Fatalf("expected rate limit, got %v", err)
	}
	var pe *Error
	errors.As(err, &pe)
	if pe.RetryAfter != 42 {
		t.Fatalf("retry-after = %v, want 42", pe.RetryAfter)
	}
}

func TestRetries500ThenSucceeds(t *testing.T) {
	var n int32
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&n, 1) == 1 {
			writeErr(w, 500, "internal", nil)
			return
		}
		writeData(w, 200, rateData)
	}, WithMaxRetries(2))
	rate, err := c.Rates.Calculate(context.Background(), RateParams{Origin: "400001", Destination: "110001", Weight: 500})
	if err != nil || rate.Total != 254.38 {
		t.Fatalf("Calculate: %v %+v", err, rate)
	}
	if n != 2 {
		t.Fatalf("attempts = %d, want 2", n)
	}
}

func TestGivesUpAfterMaxRetries(t *testing.T) {
	var n int32
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&n, 1)
		writeErr(w, 503, "unavailable", nil)
	}, WithMaxRetries(2))
	_, err := c.Pincodes.Get(context.Background(), "302001")
	if !IsAPIError(err) {
		t.Fatalf("expected api error, got %v", err)
	}
	if n != 3 {
		t.Fatalf("attempts = %d, want 3", n)
	}
}

func TestDoesNotRetry400(t *testing.T) {
	var n int32
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&n, 1)
		writeErr(w, 400, "validation_error", nil)
	}, WithMaxRetries(3))
	_, err := c.Pincodes.Get(context.Background(), "bad")
	if !IsValidation(err) {
		t.Fatalf("expected validation error, got %v", err)
	}
	if n != 1 {
		t.Fatalf("attempts = %d, want 1", n)
	}
}

type errTransport struct{}

func (errTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("dial tcp: connection refused")
}

func TestConnectionError(t *testing.T) {
	c, _ := New(testKey, WithBaseURL("http://example.invalid"), WithHTTPClient(&http.Client{Transport: errTransport{}}), WithMaxRetries(1))
	c.sleep = func(time.Duration) {}
	_, err := c.Plans.List(context.Background())
	if !IsConnection(err) {
		t.Fatalf("expected connection error, got %v", err)
	}
}

type netTimeout struct{}

func (netTimeout) Error() string   { return "i/o timeout" }
func (netTimeout) Timeout() bool   { return true }
func (netTimeout) Temporary() bool { return true }

type timeoutTransport struct{}

func (timeoutTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	return nil, &url.Error{Op: r.Method, URL: r.URL.String(), Err: netTimeout{}}
}

func TestTimeout(t *testing.T) {
	c, _ := New(testKey, WithBaseURL("http://example.invalid"), WithHTTPClient(&http.Client{Transport: timeoutTransport{}}), WithMaxRetries(0))
	c.sleep = func(time.Duration) {}
	_, err := c.Plans.List(context.Background())
	if !IsTimeout(err) {
		t.Fatalf("expected timeout error, got %v", err)
	}
}
