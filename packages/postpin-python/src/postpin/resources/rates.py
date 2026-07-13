from __future__ import annotations

from typing import Any, Dict, Optional

from .._http import HTTPClient
from ..types import RateResult, ServiceLevel


class Rates:
    def __init__(self, http: HTTPClient) -> None:
        self._http = http

    def calculate(
        self,
        *,
        origin: str,
        destination: str,
        weight: int,
        length: Optional[float] = None,
        width: Optional[float] = None,
        height: Optional[float] = None,
        service: Optional[ServiceLevel] = None,
        cod: Optional[bool] = None,
        declared_value: Optional[float] = None,
        idempotency_key: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> RateResult:
        """Calculate the shipping rate between two Indian pincodes.

        ``weight`` is in grams; ``length``/``width``/``height`` are in cm and
        enable volumetric-weight pricing. ``declared_value`` is in rupees.
        """
        body: Dict[str, Any] = {"origin": origin, "destination": destination, "weight": weight}
        if length is not None:
            body["length"] = length
        if width is not None:
            body["width"] = width
        if height is not None:
            body["height"] = height
        if service is not None:
            body["service"] = service
        if cod is not None:
            body["cod"] = cod
        if declared_value is not None:
            body["declared_value"] = declared_value

        data, _ = self._http.request(
            "POST",
            "/rates/calculate",
            json_body=body,
            idempotency_key=idempotency_key,
            timeout=timeout,
        )
        return RateResult._from(data)
