from __future__ import annotations

from typing import List, Optional

from .._http import HTTPClient
from ..types import Pincode, StateSummary


class Pincodes:
    def __init__(self, http: HTTPClient) -> None:
        self._http = http

    def get(self, code: str, *, timeout: Optional[float] = None) -> Pincode:
        """Look up a single pincode, including nearby serviceable pincodes."""
        data, _ = self._http.request("GET", f"/public/pincodes/{code}", timeout=timeout)
        return Pincode._from(data)

    def states(self, *, timeout: Optional[float] = None) -> List[StateSummary]:
        """List every state with its serviceable-pincode counts."""
        data, _ = self._http.request("GET", "/public/pincodes/states", timeout=timeout)
        return [StateSummary._from(item) for item in (data or [])]
