"""Typed exception hierarchy for the Postpin SDK.

Every failure raises a subclass of :class:`PostpinError`, so callers can catch
the base class broadly or a specific subclass to branch on the failure mode.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


class PostpinError(Exception):
    """Base class for every error raised by the SDK."""

    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        request_id: Optional[str] = None,
        details: Any = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.request_id = request_id
        self.details = details
        self.headers: Dict[str, str] = dict(headers or {})


class APIConnectionError(PostpinError):
    """The request never reached Postpin (DNS, TCP, TLS, or a dropped connection)."""


class APITimeoutError(APIConnectionError):
    """The request exceeded the configured timeout."""


class AuthenticationError(PostpinError):
    """HTTP 401 — missing or invalid API key."""


class PermissionDeniedError(PostpinError):
    """HTTP 403 — the key is valid but lacks the required scope."""


class ValidationError(PostpinError):
    """HTTP 400 / 422 — the request parameters were invalid (see ``details``)."""


class NotFoundError(PostpinError):
    """HTTP 404 — the requested resource does not exist."""


class QuotaExceededError(PostpinError):
    """HTTP 402 — the account's monthly quota is used up."""


class RateLimitError(PostpinError):
    """HTTP 429 — too many requests. ``retry_after`` is the server hint in seconds."""

    def __init__(self, message: str, *, retry_after: Optional[float] = None, **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.retry_after = retry_after


class APIError(PostpinError):
    """HTTP 5xx — a server-side error."""


class SignatureVerificationError(PostpinError):
    """A webhook signature could not be verified."""


_STATUS_MAP = {
    400: ValidationError,
    401: AuthenticationError,
    402: QuotaExceededError,
    403: PermissionDeniedError,
    404: NotFoundError,
    422: ValidationError,
    429: RateLimitError,
}


def _num(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def error_from_response(
    status: int,
    body: Any,
    headers: Optional[Dict[str, str]] = None,
) -> PostpinError:
    """Map an HTTP error response (status + parsed body + headers) to a typed error."""
    headers = dict(headers or {})
    code: Optional[str] = None
    message: Optional[str] = None
    request_id: Optional[str] = None
    details: Any = None

    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            code = err.get("code")
            message = err.get("message")
            request_id = err.get("request_id")
            details = err.get("details")
        else:
            message = body.get("message")
            request_id = body.get("request_id")

    message = message or f"Postpin API error (HTTP {status})."
    request_id = request_id or headers.get("x-request-id")

    cls = _STATUS_MAP.get(status)
    if cls is None:
        cls = APIError if status >= 500 else PostpinError

    kwargs = dict(code=code, status_code=status, request_id=request_id, details=details, headers=headers)
    if cls is RateLimitError:
        return RateLimitError(message, retry_after=_num(headers.get("retry-after")), **kwargs)
    return cls(message, **kwargs)
