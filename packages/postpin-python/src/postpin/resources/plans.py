from __future__ import annotations

from typing import List, Optional

from .._http import HTTPClient
from ..types import Plan


class Plans:
    def __init__(self, http: HTTPClient) -> None:
        self._http = http

    def list(self, *, timeout: Optional[float] = None) -> List[Plan]:
        """List all public, active subscription plans."""
        data, _ = self._http.request("GET", "/public/plans", timeout=timeout)
        return [Plan._from(item) for item in (data or [])]
