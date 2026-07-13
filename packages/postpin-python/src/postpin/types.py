"""Typed result models returned by the SDK.

Each model has a private ``_from`` constructor that maps the API's JSON payload
onto Pythonic snake_case attributes. The full raw payload is preserved on
``.raw`` so new API fields are never lost before the SDK is updated.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

try:  # Literal is available in typing from 3.8+
    from typing import Literal

    ServiceLevel = Literal["surface", "express", "same_day"]
except ImportError:  # pragma: no cover
    ServiceLevel = str  # type: ignore


def _f(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _i(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class RateEndpoint:
    pincode: str
    city: Optional[str] = None
    state: Optional[str] = None

    @classmethod
    def _from(cls, d: Optional[Dict[str, Any]]) -> "RateEndpoint":
        d = d or {}
        return cls(pincode=d.get("pincode", ""), city=d.get("city"), state=d.get("state"))


@dataclass(frozen=True)
class RateBreakdownLine:
    label: str
    amount: float
    hint: Optional[str] = None


@dataclass(frozen=True)
class RateResult:
    zone: str
    zone_label: str
    service: str
    service_label: str
    chargeable_weight_grams: int
    volumetric_weight_grams: int
    eta_days: List[int]
    currency: str
    breakdown: List[RateBreakdownLine]
    total: float
    total_paise: int
    origin: RateEndpoint
    destination: RateEndpoint
    serviceable: bool
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def _from(cls, d: Dict[str, Any]) -> "RateResult":
        return cls(
            zone=d.get("zone", ""),
            zone_label=d.get("zoneLabel", ""),
            service=d.get("service", ""),
            service_label=d.get("serviceLabel", ""),
            chargeable_weight_grams=_i(d.get("chargeableWeightGrams")),
            volumetric_weight_grams=_i(d.get("volumetricWeightGrams")),
            eta_days=[_i(x) for x in (d.get("etaDays") or [])],
            currency=d.get("currency", "INR"),
            breakdown=[
                RateBreakdownLine(label=b.get("label", ""), amount=_f(b.get("amount")), hint=b.get("hint"))
                for b in (d.get("breakdown") or [])
            ],
            total=_f(d.get("total")),
            total_paise=_i(d.get("totalPaise")),
            origin=RateEndpoint._from(d.get("origin")),
            destination=RateEndpoint._from(d.get("destination")),
            serviceable=bool(d.get("serviceable", False)),
            raw=d,
        )


@dataclass(frozen=True)
class Serviceability:
    pincode: str
    serviceable: bool
    found: bool
    city: Optional[str]
    state: Optional[str]
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def _from(cls, d: Dict[str, Any]) -> "Serviceability":
        return cls(
            pincode=d.get("pincode", ""),
            serviceable=bool(d.get("serviceable", False)),
            found=bool(d.get("found", False)),
            city=d.get("city"),
            state=d.get("state"),
            raw=d,
        )


@dataclass(frozen=True)
class PincodeNearby:
    pincode: str
    city: Optional[str] = None
    distance_km: Optional[float] = None
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)


@dataclass(frozen=True)
class Pincode:
    pincode: str
    city: Optional[str]
    district: Optional[str]
    state: Optional[str]
    office_name: Optional[str]
    is_metro: bool
    is_remote: bool
    serviceable: bool
    nearby: List[PincodeNearby]
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def _from(cls, d: Dict[str, Any]) -> "Pincode":
        return cls(
            pincode=d.get("pincode", ""),
            city=d.get("city"),
            district=d.get("district"),
            state=d.get("state"),
            office_name=d.get("office_name"),
            is_metro=bool(d.get("is_metro", False)),
            is_remote=bool(d.get("is_remote", False)),
            serviceable=bool(d.get("serviceable", False)),
            nearby=[
                PincodeNearby(
                    pincode=n.get("pincode", ""),
                    city=n.get("city"),
                    distance_km=n.get("distance_km", n.get("distanceKm")),
                    raw=n,
                )
                for n in (d.get("nearby") or [])
            ],
            raw=d,
        )


@dataclass(frozen=True)
class StateSummary:
    state: str
    slug: str
    count: int
    metros: int
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def _from(cls, d: Dict[str, Any]) -> "StateSummary":
        return cls(
            state=d.get("state", ""),
            slug=d.get("slug", ""),
            count=_i(d.get("count")),
            metros=_i(d.get("metros")),
            raw=d,
        )


@dataclass(frozen=True)
class Plan:
    code: str
    name: str
    included_calls: Optional[int] = None
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def _from(cls, d: Dict[str, Any]) -> "Plan":
        included = d.get("included_calls", d.get("includedCalls"))
        return cls(
            code=d.get("code", ""),
            name=d.get("name", ""),
            included_calls=_i(included) if included is not None else None,
            raw=d,
        )
