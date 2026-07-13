from __future__ import annotations

from typing import Dict, Optional

import httpx

from ._http import HTTPClient
from ._version import __version__
from .resources import Pincodes, Plans, Rates, Serviceability


class Postpin:
    """The Postpin API client.

    Example::

        from postpin import Postpin

        client = Postpin(os.environ["POSTPIN_API_KEY"])
        rate = client.rates.calculate(origin="400001", destination="110001", weight=1200)
        print(rate.total, rate.currency)
    """

    VERSION = __version__

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
        self._http = HTTPClient(
            api_key,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
            transport=transport,
            headers=headers,
        )
        self.rates = Rates(self._http)
        self.serviceability = Serviceability(self._http)
        self.pincodes = Pincodes(self._http)
        self.plans = Plans(self._http)

    def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        self._http.close()

    def __enter__(self) -> "Postpin":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
