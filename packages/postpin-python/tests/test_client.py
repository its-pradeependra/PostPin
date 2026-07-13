from __future__ import annotations

import json

import httpx
import pytest

from postpin import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    NotFoundError,
    Postpin,
    PostpinError,
    QuotaExceededError,
    RateLimitError,
    ValidationError,
)

KEY = "pp_test_abc123"

RATE = {
    "zone": "metro",
    "zoneLabel": "Metro",
    "service": "express",
    "serviceLabel": "Express",
    "chargeableWeightGrams": 1200,
    "volumetricWeightGrams": 0,
    "etaDays": [1, 3],
    "currency": "INR",
    "breakdown": [{"label": "Base charge", "amount": 88}],
    "total": 254.38,
    "totalPaise": 25438,
    "origin": {"pincode": "400001", "city": "Mumbai", "state": "Maharashtra"},
    "destination": {"pincode": "110001", "city": "New Delhi", "state": "Delhi"},
    "serviceable": True,
}


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    # Kill retry backoff delays so tests are fast + deterministic.
    monkeypatch.setattr("postpin._http.time.sleep", lambda *_a, **_k: None)


def ok(data, **meta):
    return httpx.Response(200, json={"data": data, "meta": {"request_id": "req_1", **meta}})


def err(status, code, message="boom", headers=None):
    return httpx.Response(
        status,
        json={"error": {"code": code, "message": message, "request_id": "req_err"}},
        headers=headers or {},
    )


class Recorder:
    """Returns queued responses in order (last one repeats), recording requests."""

    def __init__(self, responses):
        self._responses = responses
        self.calls = []

    def __call__(self, request):
        self.calls.append(request)
        i = min(len(self.calls) - 1, len(self._responses) - 1)
        return self._responses[i]()


def make(responses, **kwargs):
    rec = Recorder(responses)
    client = Postpin(KEY, transport=httpx.MockTransport(rec), **kwargs)
    return client, rec


# --- construction ---------------------------------------------------------


def test_requires_api_key():
    with pytest.raises(PostpinError):
        Postpin("")
    with pytest.raises(PostpinError):
        Postpin(None)  # type: ignore[arg-type]


def test_exposes_version():
    assert isinstance(Postpin.VERSION, str)


# --- rates ----------------------------------------------------------------


def test_rates_calculate_body_and_headers():
    client, rec = make([lambda: ok(RATE)])
    rate = client.rates.calculate(
        origin="400001",
        destination="110001",
        weight=1200,
        service="express",
        cod=True,
        declared_value=1499,
    )

    assert rate.total == 254.38
    assert rate.zone_label == "Metro"
    assert rate.eta_days == [1, 3]
    assert rate.origin.city == "Mumbai"
    assert rate.breakdown[0].label == "Base charge"

    req = rec.calls[0]
    assert str(req.url) == "https://api.postpin.in/v1/rates/calculate"
    assert req.method == "POST"
    assert req.headers["authorization"] == f"Bearer {KEY}"
    assert req.headers["user-agent"].startswith("postpin-python/")
    assert req.headers.get("idempotency-key")
    body = json.loads(req.content.decode())
    assert body == {
        "origin": "400001",
        "destination": "110001",
        "weight": 1200,
        "service": "express",
        "cod": True,
        "declared_value": 1499,
    }


def test_explicit_idempotency_key():
    client, rec = make([lambda: ok(RATE)])
    client.rates.calculate(origin="400001", destination="110001", weight=500, idempotency_key="my-key")
    assert rec.calls[0].headers["idempotency-key"] == "my-key"


# --- public resources -----------------------------------------------------


def test_serviceability_check():
    client, rec = make([lambda: ok({"pincode": "781001", "serviceable": True, "found": True, "city": "Guwahati", "state": "Assam"})])
    s = client.serviceability.check("781001")
    assert s.city == "Guwahati"
    assert s.serviceable is True
    assert str(rec.calls[0].url) == "https://api.postpin.in/v1/public/serviceability/781001"
    assert rec.calls[0].method == "GET"


def test_pincodes_get_and_states():
    client, _ = make(
        [
            lambda: ok({"pincode": "302001", "city": "Jaipur", "state": "Rajasthan", "is_metro": False, "is_remote": False, "serviceable": True, "nearby": []}),
            lambda: ok([{"state": "Rajasthan", "slug": "rajasthan", "count": 100, "metros": 0}]),
        ]
    )
    assert client.pincodes.get("302001").city == "Jaipur"
    assert client.pincodes.states()[0].slug == "rajasthan"


def test_plans_list():
    client, _ = make([lambda: ok([{"code": "free", "name": "Free", "included_calls": 1000}])])
    plans = client.plans.list()
    assert plans[0].code == "free"
    assert plans[0].included_calls == 1000


# --- error mapping --------------------------------------------------------


@pytest.mark.parametrize(
    "status,code,exc",
    [
        (400, "validation_error", ValidationError),
        (401, "invalid_key", AuthenticationError),
        (402, "quota_exceeded", QuotaExceededError),
        (404, "not_found", NotFoundError),
        (500, "internal", APIError),
    ],
)
def test_error_mapping(status, code, exc):
    client, _ = make([lambda: err(status, code)], max_retries=0)
    with pytest.raises(exc) as ei:
        client.pincodes.get("000000")
    assert ei.value.code == code
    assert ei.value.status_code == status
    assert ei.value.request_id == "req_err"


def test_rate_limit_carries_retry_after():
    client, _ = make([lambda: err(429, "rate_limited", "slow down", {"retry-after": "42"})], max_retries=0)
    with pytest.raises(RateLimitError) as ei:
        client.rates.calculate(origin="400001", destination="110001", weight=500)
    assert ei.value.retry_after == 42


# --- retries --------------------------------------------------------------


def test_retries_500_then_succeeds():
    client, rec = make([lambda: err(500, "internal"), lambda: ok(RATE)], max_retries=2)
    rate = client.rates.calculate(origin="400001", destination="110001", weight=500)
    assert rate.total == 254.38
    assert len(rec.calls) == 2


def test_retries_network_error_then_succeeds():
    state = {"n": 0}

    def handler(request):
        state["n"] += 1
        if state["n"] == 1:
            raise httpx.ConnectError("boom", request=request)
        return ok(RATE)

    client = Postpin(KEY, transport=httpx.MockTransport(handler), max_retries=1)
    assert client.rates.calculate(origin="400001", destination="110001", weight=500).total == 254.38
    assert state["n"] == 2


def test_gives_up_after_max_retries():
    client, rec = make([lambda: err(503, "unavailable")], max_retries=2)
    with pytest.raises(APIError):
        client.pincodes.get("302001")
    assert len(rec.calls) == 3  # 1 + 2 retries


def test_does_not_retry_400():
    client, rec = make([lambda: err(400, "validation_error")], max_retries=3)
    with pytest.raises(ValidationError):
        client.pincodes.get("bad")
    assert len(rec.calls) == 1


def test_connection_error_surfaced():
    def handler(request):
        raise httpx.ConnectError("refused", request=request)

    client = Postpin(KEY, transport=httpx.MockTransport(handler), max_retries=1)
    with pytest.raises(APIConnectionError):
        client.plans.list()


def test_timeout_raises_api_timeout():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    client = Postpin(KEY, transport=httpx.MockTransport(handler), max_retries=0)
    with pytest.raises(APITimeoutError):
        client.plans.list()
