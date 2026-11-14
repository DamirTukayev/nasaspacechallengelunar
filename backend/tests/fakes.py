from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.services.disk_cache import JsonDiskCache
from app.services.horizons import EARTH, SUN, HorizonsClient

FIXTURES = Path(__file__).parent / "fixtures"

# The recorded fixtures: Mons Malapert, 2026-12-01 00:00–03:00 UTC, hourly.
FIXTURE_START = datetime(2026, 12, 1, tzinfo=UTC)
FIXTURE_STOP = datetime(2026, 12, 1, 3, tzinfo=UTC)
FIXTURE_SITE = {"lat": -85.98, "lon": -1.67, "alt_m": 0.0}


def fixture(name: str) -> str:
    return (FIXTURES / f"horizons_{name}.json").read_text()


class FakeHorizons:
    """Serves recorded responses and remembers what was requested."""

    def __init__(self, override: httpx.Response | Exception | None = None) -> None:
        self.requests: list[httpx.Request] = []
        self.override = override

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if isinstance(self.override, Exception):
            raise self.override
        if self.override is not None:
            return self.override
        target = request.url.params["COMMAND"].strip("'")
        name = {SUN: "sun", EARTH: "earth"}[target]
        return httpx.Response(200, text=fixture(name))

    def client(self, cache: JsonDiskCache | None = None) -> HorizonsClient:
        return HorizonsClient(
            "https://horizons.test/api", cache=cache, transport=httpx.MockTransport(self)
        )
