// Package postpin is the official Go SDK for the Postpin shipping-rate API.
//
// https://postpin.in
package postpin

import (
	"errors"
	"net/http"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.postpin.in/v1"

// Client is the Postpin API client. Create one with New and reuse it; it is
// safe for concurrent use by multiple goroutines.
type Client struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
	maxRetries int
	timeout    time.Duration
	header     http.Header
	sleep      func(time.Duration) // seam for tests

	Rates          *RatesService
	Serviceability *ServiceabilityService
	Pincodes       *PincodesService
	Plans          *PlansService
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL overrides the API base URL (including the version prefix).
func WithBaseURL(u string) Option {
	return func(c *Client) { c.baseURL = strings.TrimRight(u, "/") }
}

// WithHTTPClient supplies a custom *http.Client (proxies, transports, tests).
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) {
		if hc != nil {
			c.httpClient = hc
		}
	}
}

// WithTimeout sets the per-request timeout. Default: 30s.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.timeout = d }
}

// WithMaxRetries sets the maximum automatic retries on 429/5xx/network errors.
// Default: 2.
func WithMaxRetries(n int) Option {
	return func(c *Client) {
		if n >= 0 {
			c.maxRetries = n
		}
	}
}

// WithHeader adds a header sent on every request.
func WithHeader(key, value string) Option {
	return func(c *Client) { c.header.Set(key, value) }
}

// New creates a Client. It returns an error if apiKey is empty.
func New(apiKey string, opts ...Option) (*Client, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("postpin: an API key is required")
	}
	c := &Client{
		apiKey:     apiKey,
		baseURL:    defaultBaseURL,
		httpClient: &http.Client{},
		maxRetries: 2,
		timeout:    30 * time.Second,
		header:     http.Header{},
		sleep:      time.Sleep,
	}
	for _, opt := range opts {
		opt(c)
	}
	c.Rates = &RatesService{client: c}
	c.Serviceability = &ServiceabilityService{client: c}
	c.Pincodes = &PincodesService{client: c}
	c.Plans = &PlansService{client: c}
	return c, nil
}
