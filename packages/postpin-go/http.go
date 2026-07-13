package postpin

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	mrand "math/rand"
	"net"
	"net/http"
	"net/url"
	"time"
)

var retryableStatus = map[int]bool{
	408: true, 409: true, 425: true, 429: true,
	500: true, 502: true, 503: true, 504: true,
}

// do performs a request with retries, timeout, and envelope unwrapping. It
// returns the raw `data` field of the {data, meta} envelope.
func (c *Client) do(ctx context.Context, method, path string, query url.Values, body any, idempotencyKey string) (json.RawMessage, error) {
	var bodyBytes []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, &Error{Type: ErrorTypeValidation, Message: "failed to encode request body: " + err.Error(), wrapped: err}
		}
		bodyBytes = b
	}

	fullURL := c.baseURL + path
	if len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	for attempt := 0; ; attempt++ {
		reqCtx := ctx
		var cancel context.CancelFunc
		if c.timeout > 0 {
			reqCtx, cancel = context.WithTimeout(ctx, c.timeout)
		}

		var reader io.Reader
		if bodyBytes != nil {
			reader = bytes.NewReader(bodyBytes)
		}
		req, err := http.NewRequestWithContext(reqCtx, method, fullURL, reader)
		if err != nil {
			if cancel != nil {
				cancel()
			}
			return nil, &Error{Type: ErrorTypeConnection, Code: "connection_error", Message: err.Error(), wrapped: err}
		}
		c.setHeaders(req, method, idempotencyKey)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			if cancel != nil {
				cancel()
			}
			if attempt < c.maxRetries {
				c.sleep(c.backoff(attempt, 0))
				continue
			}
			if isTimeout(err) {
				return nil, &Error{Type: ErrorTypeTimeout, Code: "timeout", Message: "request timed out: " + err.Error(), wrapped: err}
			}
			return nil, &Error{Type: ErrorTypeConnection, Code: "connection_error", Message: "could not reach Postpin: " + err.Error(), wrapped: err}
		}

		data, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if cancel != nil {
			cancel()
		}
		if readErr != nil {
			if attempt < c.maxRetries {
				c.sleep(c.backoff(attempt, 0))
				continue
			}
			return nil, &Error{Type: ErrorTypeConnection, Code: "connection_error", Message: "failed reading response: " + readErr.Error(), wrapped: readErr}
		}

		if resp.StatusCode >= 400 {
			if retryableStatus[resp.StatusCode] && attempt < c.maxRetries {
				c.sleep(c.backoff(attempt, parseRetryAfter(resp.Header.Get("Retry-After"))))
				continue
			}
			return nil, errorFromResponse(resp.StatusCode, data, resp.Header)
		}

		if len(data) == 0 {
			return nil, nil
		}
		var env struct {
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(data, &env); err == nil && env.Data != nil {
			return env.Data, nil
		}
		return data, nil
	}
}

func (c *Client) setHeaders(req *http.Request, method, idempotencyKey string) {
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	ua := "postpin-go/" + Version
	req.Header.Set("User-Agent", ua)
	req.Header.Set("X-Postpin-Client", ua)
	for k, vals := range c.header {
		for _, v := range vals {
			req.Header.Set(k, v)
		}
	}
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
		if idempotencyKey == "" {
			idempotencyKey = newIdempotencyKey()
		}
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
}

func (c *Client) backoff(attempt int, retryAfter float64) time.Duration {
	if retryAfter > 0 {
		return time.Duration(retryAfter * float64(time.Second))
	}
	base := 0.5 * math.Pow(2, float64(attempt))
	if base > 8 {
		base = 8
	}
	return time.Duration(mrand.Float64() * base * float64(time.Second)) // full jitter
}

func decode(data json.RawMessage, out any) error {
	if err := json.Unmarshal(data, out); err != nil {
		return &Error{Type: ErrorTypeAPI, Code: "decode_error", Message: "failed to decode Postpin response: " + err.Error(), wrapped: err}
	}
	return nil
}

func isTimeout(err error) bool {
	var ne net.Error
	if ok := asNetError(err, &ne); ok && ne.Timeout() {
		return true
	}
	return err == context.DeadlineExceeded
}

func asNetError(err error, target *net.Error) bool {
	for err != nil {
		if ne, ok := err.(net.Error); ok {
			*target = ne
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

func newIdempotencyKey() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("idem-%d", time.Now().UnixNano())
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant
	dst := make([]byte, 36)
	hex.Encode(dst[0:8], b[0:4])
	dst[8] = '-'
	hex.Encode(dst[9:13], b[4:6])
	dst[13] = '-'
	hex.Encode(dst[14:18], b[6:8])
	dst[18] = '-'
	hex.Encode(dst[19:23], b[8:10])
	dst[23] = '-'
	hex.Encode(dst[24:36], b[10:16])
	return string(dst)
}
