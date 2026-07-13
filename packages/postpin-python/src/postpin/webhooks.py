"""Verify inbound Postpin webhooks.

Postpin signs every delivery with:

    x-postpin-signature: t=<unix-seconds>,v1=<hex hmac-sha256("<t>.<rawBody>", secret)>

ALWAYS verify against the RAW request body bytes — re-serializing the JSON
changes whitespace/key order and breaks the signature.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any, Optional, Sequence, Union

from .errors import SignatureVerificationError

DEFAULT_TOLERANCE_SECONDS = 300

Payload = Union[str, bytes, bytearray]
Header = Union[str, Sequence[str], None]


def _to_bytes(payload: Payload) -> bytes:
    if isinstance(payload, (bytes, bytearray)):
        return bytes(payload)
    return str(payload).encode("utf-8")


def _header_value(header: Header) -> str:
    if header is None:
        return ""
    if isinstance(header, (list, tuple)):
        return header[0] if header else ""
    return header


def _parse(header: str):
    t: Optional[int] = None
    v1: Optional[str] = None
    for part in header.split(","):
        if "=" not in part:
            continue
        key, _, val = part.partition("=")
        key = key.strip()
        val = val.strip()
        if key == "t":
            try:
                t = int(val)
            except ValueError:
                t = None
        elif key == "v1":
            v1 = val
    return t, v1


def verify(
    payload: Payload,
    signature_header: Header,
    secret: str,
    *,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: Optional[int] = None,
) -> bool:
    """Verify a webhook signature.

    Returns ``True`` on success; raises :class:`SignatureVerificationError` on any
    failure (missing/malformed header, wrong signature, or a stale timestamp).
    """
    header = _header_value(signature_header)
    if not header:
        raise SignatureVerificationError("Missing Postpin signature header.", code="signature_missing")
    if not secret:
        raise SignatureVerificationError("A webhook signing secret is required.", code="secret_missing")

    t, v1 = _parse(header)
    if t is None or not v1:
        raise SignatureVerificationError("Malformed Postpin signature header.", code="signature_malformed")

    signed = f"{t}.".encode("utf-8") + _to_bytes(payload)
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(v1, expected):
        raise SignatureVerificationError(
            "Webhook signature does not match — payload may be forged or the secret is wrong.",
            code="signature_mismatch",
        )

    if tolerance_seconds and tolerance_seconds > 0:
        current = int(now if now is not None else time.time())
        if abs(current - t) > tolerance_seconds:
            raise SignatureVerificationError(
                f"Webhook timestamp is outside the allowed tolerance of {tolerance_seconds}s (possible replay).",
                code="signature_timestamp",
            )
    return True


def construct_event(
    payload: Payload,
    signature_header: Header,
    secret: str,
    *,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: Optional[int] = None,
) -> Any:
    """Verify the signature and return the parsed event dict — the safe way to
    consume a webhook."""
    verify(payload, signature_header, secret, tolerance_seconds=tolerance_seconds, now=now)
    try:
        return json.loads(_to_bytes(payload).decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise SignatureVerificationError("Webhook payload is not valid JSON.", code="invalid_json") from exc
