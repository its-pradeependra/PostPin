package postpin

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
)

// ErrorType classifies a *Error so callers can branch on the failure mode.
type ErrorType string

const (
	ErrorTypeAuthentication ErrorType = "authentication_error"
	ErrorTypePermission     ErrorType = "permission_error"
	ErrorTypeValidation     ErrorType = "validation_error"
	ErrorTypeNotFound       ErrorType = "not_found_error"
	ErrorTypeQuota          ErrorType = "quota_exceeded"
	ErrorTypeRateLimit      ErrorType = "rate_limit_error"
	ErrorTypeAPI            ErrorType = "api_error"
	ErrorTypeConnection     ErrorType = "connection_error"
	ErrorTypeTimeout        ErrorType = "timeout_error"
)

// Error is the single error type returned by every SDK call that talks to the
// API. Use the Is* helpers (IsRateLimit, IsValidation, ...) to classify it.
type Error struct {
	Type       ErrorType
	Code       string
	Message    string
	StatusCode int
	RequestID  string
	Details    json.RawMessage
	RetryAfter float64 // seconds; only set for rate-limit errors
	Header     http.Header
	wrapped    error
}

func (e *Error) Error() string {
	if e.StatusCode > 0 {
		return fmt.Sprintf("postpin: %s (type=%s, code=%s, status=%d, request_id=%s)",
			e.Message, e.Type, e.Code, e.StatusCode, e.RequestID)
	}
	return fmt.Sprintf("postpin: %s (type=%s)", e.Message, e.Type)
}

func (e *Error) Unwrap() error { return e.wrapped }

// SignatureError is returned by webhook verification failures.
type SignatureError struct {
	Code    string
	Message string
}

func (e *SignatureError) Error() string { return "postpin: " + e.Message }

func asError(err error) (*Error, bool) {
	var pe *Error
	if errors.As(err, &pe) {
		return pe, true
	}
	return nil, false
}

func hasType(err error, t ErrorType) bool {
	pe, ok := asError(err)
	return ok && pe.Type == t
}

// IsAuthentication reports whether err is an HTTP 401 authentication error.
func IsAuthentication(err error) bool { return hasType(err, ErrorTypeAuthentication) }

// IsPermission reports whether err is an HTTP 403 permission error.
func IsPermission(err error) bool { return hasType(err, ErrorTypePermission) }

// IsValidation reports whether err is an HTTP 400/422 validation error.
func IsValidation(err error) bool { return hasType(err, ErrorTypeValidation) }

// IsNotFound reports whether err is an HTTP 404 error.
func IsNotFound(err error) bool { return hasType(err, ErrorTypeNotFound) }

// IsQuotaExceeded reports whether err is an HTTP 402 quota error.
func IsQuotaExceeded(err error) bool { return hasType(err, ErrorTypeQuota) }

// IsRateLimit reports whether err is an HTTP 429 rate-limit error.
func IsRateLimit(err error) bool { return hasType(err, ErrorTypeRateLimit) }

// IsAPIError reports whether err is an HTTP 5xx server error.
func IsAPIError(err error) bool { return hasType(err, ErrorTypeAPI) }

// IsTimeout reports whether err is a request timeout.
func IsTimeout(err error) bool { return hasType(err, ErrorTypeTimeout) }

// IsConnection reports whether err is a network connection error.
func IsConnection(err error) bool { return hasType(err, ErrorTypeConnection) }

// IsSignatureError reports whether err is a webhook signature verification failure.
func IsSignatureError(err error) bool {
	var se *SignatureError
	return errors.As(err, &se)
}

func typeForStatus(status int) ErrorType {
	switch status {
	case http.StatusUnauthorized:
		return ErrorTypeAuthentication
	case http.StatusForbidden:
		return ErrorTypePermission
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		return ErrorTypeValidation
	case http.StatusNotFound:
		return ErrorTypeNotFound
	case http.StatusPaymentRequired:
		return ErrorTypeQuota
	case http.StatusTooManyRequests:
		return ErrorTypeRateLimit
	default:
		if status >= 500 {
			return ErrorTypeAPI
		}
		return ErrorTypeAPI
	}
}

func errorFromResponse(status int, body []byte, header http.Header) *Error {
	e := &Error{StatusCode: status, Header: header, Type: typeForStatus(status)}

	var env struct {
		Error struct {
			Code      string          `json:"code"`
			Message   string          `json:"message"`
			RequestID string          `json:"request_id"`
			Details   json.RawMessage `json:"details"`
		} `json:"error"`
	}
	_ = json.Unmarshal(body, &env)

	e.Code = env.Error.Code
	e.Message = env.Error.Message
	e.RequestID = env.Error.RequestID
	if len(env.Error.Details) > 0 {
		e.Details = env.Error.Details
	}
	if e.Message == "" {
		e.Message = fmt.Sprintf("Postpin API error (HTTP %d)", status)
	}
	if e.RequestID == "" {
		e.RequestID = header.Get("X-Request-Id")
	}
	if status == http.StatusTooManyRequests {
		e.RetryAfter = parseRetryAfter(header.Get("Retry-After"))
	}
	return e
}

func parseRetryAfter(value string) float64 {
	if value == "" {
		return 0
	}
	f, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0
	}
	return f
}
