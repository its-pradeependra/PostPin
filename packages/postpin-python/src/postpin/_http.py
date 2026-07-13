"""Internal HTTP layer: auth, retries with backoff, timeouts, idempotency, and
mapping of the ``{data, meta}`` envelope / error envelope onto typed results."""

from __future__ import annotations

import random
import time
import uuid
from typing import Any, Dict, Optional, Tuple

import httpx

from ._version import __version__
from .errors import (
    APIConnectionError,
    APITimeoutError,
    PostpinError,
    error_from_response,
)

DEFAULT_BASE_URL = "https://api.postpin.in/v1"
RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}
_MAX_BACKOFF_SECONDS = 8.0


class HTTPClient:
    def __init__(
        self,
        api_key: str,
        *,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 2,
        transport: Optional[httpx.BaseTransport] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        if not api_key or not isinstance(api_key, str):
            raise PostpinError("A Postpin API key is required.", code="config_error")
        self._api_key = api_key
        self._max_retries = max(0, int(max_retries))
        self._extra_headers = dict(headers or {})
        base = (base_url or DEFAULT_BASE_URL).rstrip("/") + "/"
        self._client = httpx.Client(base_url=base, timeout=timeout, transport=transport)

    def close(self) -> None:
        self._client.close()

    def _headers(self, method: str, idempotency_key: Optional[str]) -> Dict[str, str]:
        headers = {
            "authorization": f"Bearer {self._api_key}",
            "accept": "application/json",
            "user-agent": f"postpin-python/{__version__}",
            "x-postpin-client": f"postpin-python/{__version__}",
        }
        headers.update(self._extra_headers)
        if method == "POST":
            headers["content-type"] = "application/json"
            headers["idempotency-key"] = idempotency_key or str(uuid.uuid4())
        return headers

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Any = None,
        idempotency_key: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> Tuple[Any, Dict[str, Any]]:
        headers = self._headers(method, idempotency_key)
        url = path if path.startswith("http") else path.lstrip("/")

        attempt = 0
        while True:
            try:
                kwargs: Dict[str, Any] = {"headers": headers}
                if params is not None:
                    kwargs["params"] = params
                if json_body is not None:
                    kwargs["json"] = json_body
                if timeout is not None:
                    kwargs["timeout"] = timeout
                response = self._client.request(method, url, **kwargs)
            except httpx.TimeoutException as exc:
                if attempt < self._max_retries:
                    self._sleep_backoff(attempt, None)
                    attempt += 1
                    continue
                raise APITimeoutError(f"Request timed out after {self._max_retries + 1} attempt(s): {exc}", code="timeout") from exc
            except httpx.HTTPError as exc:
                if attempt < self._max_retries:
                    self._sleep_backoff(attempt, None)
                    attempt += 1
                    continue
                raise APIConnectionError(f"Could not reach Postpin: {exc}", code="connection_error") from exc

            if response.status_code >= 400:
                if response.status_code in RETRYABLE_STATUS and attempt < self._max_retries:
                    retry_after = _parse_retry_after(response.headers.get("retry-after"))
                    self._sleep_backoff(attempt, retry_after)
                    attempt += 1
                    continue
                raise error_from_response(response.status_code, _safe_json(response), dict(response.headers))

            return _normalize(_safe_json(response))

    def _sleep_backoff(self, attempt: int, retry_after: Optional[float]) -> None:
        if retry_after is not None and retry_after >= 0:
            delay = retry_after
        else:
            base = min(_MAX_BACKOFF_SECONDS, 0.5 * (2 ** attempt))
            delay = random.uniform(0, base)  # full jitter
        self._sleep(delay)

    def _sleep(self, seconds: float) -> None:  # seam for tests
        time.sleep(seconds)


def _normalize(body: Any) -> Tuple[Any, Dict[str, Any]]:
    if isinstance(body, dict) and "data" in body:
        meta = body.get("meta")
        return body.get("data"), dict(meta) if isinstance(meta, dict) else {}
    return body, {}


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except Exception:
        return None


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
