from __future__ import annotations

from typing import Optional

from .._http import HTTPClient
from ..types import Serviceability as ServiceabilityResult


class Serviceability:
    def __init__(self, http: HTTPClient) -> None:
        self._http = http

    def check(self, pincode: str, *, timeout: Optional[float] = None) -> ServiceabilityResult:
        """Check whether a pincode is serviceable."""
        data, _ = self._http.request("GET", f"/public/serviceability/{pincode}", timeout=timeout)
        return ServiceabilityResult._from(data)
