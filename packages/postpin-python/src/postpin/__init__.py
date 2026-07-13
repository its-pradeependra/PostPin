"""Official Python SDK for the Postpin shipping-rate API. https://postpin.in"""

from __future__ import annotations

from . import webhooks
from ._client import Postpin
from ._version import __version__
from .errors import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    NotFoundError,
    PermissionDeniedError,
    PostpinError,
    QuotaExceededError,
    RateLimitError,
    SignatureVerificationError,
    ValidationError,
)
from .types import (
    Pincode,
    PincodeNearby,
    Plan,
    RateBreakdownLine,
    RateEndpoint,
    RateResult,
    Serviceability,
    ServiceLevel,
    StateSummary,
)

__all__ = [
    "Postpin",
    "__version__",
    "webhooks",
    # Errors
    "PostpinError",
    "APIConnectionError",
    "APITimeoutError",
    "AuthenticationError",
    "PermissionDeniedError",
    "ValidationError",
    "NotFoundError",
    "QuotaExceededError",
    "RateLimitError",
    "APIError",
    "SignatureVerificationError",
    # Types
    "ServiceLevel",
    "RateResult",
    "RateBreakdownLine",
    "RateEndpoint",
    "Serviceability",
    "Pincode",
    "PincodeNearby",
    "StateSummary",
    "Plan",
]
