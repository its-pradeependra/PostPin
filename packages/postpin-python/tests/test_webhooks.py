from __future__ import annotations

import hashlib
import hmac
import json

import pytest

from postpin import SignatureVerificationError, webhooks

SECRET = "whsec_test_secret"
NOW = 1_718_900_000
PAYLOAD = json.dumps(
    {"id": "evt_1", "event": "rate.calculated", "created": "2026-07-01T00:00:00Z", "data": {"total": 254.38}}
)


def sign(payload: str, ts: int, secret: str = SECRET) -> str:
    signed = f"{ts}.{payload}".encode("utf-8")
    v1 = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return f"t={ts},v1={v1}"


def test_accepts_valid_signature():
    assert webhooks.verify(PAYLOAD, sign(PAYLOAD, NOW), SECRET, now=NOW) is True


def test_rejects_tampered_payload():
    with pytest.raises(SignatureVerificationError):
        webhooks.verify(PAYLOAD + " ", sign(PAYLOAD, NOW), SECRET, now=NOW)


def test_rejects_wrong_secret():
    header = sign(PAYLOAD, NOW, secret="whsec_wrong")
    with pytest.raises(SignatureVerificationError) as ei:
        webhooks.verify(PAYLOAD, header, SECRET, now=NOW)
    assert ei.value.code == "signature_mismatch"


def test_rejects_stale_timestamp():
    header = sign(PAYLOAD, NOW - 10_000)
    with pytest.raises(SignatureVerificationError) as ei:
        webhooks.verify(PAYLOAD, header, SECRET, now=NOW, tolerance_seconds=300)
    assert ei.value.code == "signature_timestamp"


def test_allows_stale_timestamp_when_tolerance_disabled():
    header = sign(PAYLOAD, NOW - 10_000)
    assert webhooks.verify(PAYLOAD, header, SECRET, now=NOW, tolerance_seconds=0) is True


def test_rejects_missing_and_malformed_header():
    with pytest.raises(SignatureVerificationError) as e1:
        webhooks.verify(PAYLOAD, "", SECRET)
    assert e1.value.code == "signature_missing"
    with pytest.raises(SignatureVerificationError) as e2:
        webhooks.verify(PAYLOAD, "garbage", SECRET)
    assert e2.value.code == "signature_malformed"


def test_accepts_bytes_payload():
    assert webhooks.verify(PAYLOAD.encode("utf-8"), sign(PAYLOAD, NOW), SECRET, now=NOW) is True


def test_accepts_list_header():
    header = sign(PAYLOAD, NOW)
    assert webhooks.verify(PAYLOAD, [header, "extra"], SECRET, now=NOW) is True


def test_construct_event_returns_parsed_event():
    event = webhooks.construct_event(PAYLOAD, sign(PAYLOAD, NOW), SECRET, now=NOW)
    assert event["id"] == "evt_1"
    assert event["event"] == "rate.calculated"
    assert event["data"]["total"] == 254.38


def test_construct_event_verifies_before_parsing():
    with pytest.raises(SignatureVerificationError):
        webhooks.construct_event(PAYLOAD, sign(PAYLOAD, NOW, secret="nope"), SECRET, now=NOW)
