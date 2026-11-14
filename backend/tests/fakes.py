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


def make_polar_dem(height_fn, size: int = 301, scale_m: float = 1000.0):
    """Synthetic south polar DEM; height_fn(lat, lon) -> meters (numpy-vectorized)."""
    import numpy as np

    from app.terrain.dem import PolarDEM, PolarProjection

    half = size / 2
    radius = 1_737_400.0
    rho_edge = half * scale_m
    max_lat = float(np.degrees(2 * np.arctan(rho_edge / (2 * radius)) - np.pi / 2))
    projection = PolarProjection(
        lines=size,
        samples=size,
        map_scale_m=scale_m,
        line_offset=half,
        sample_offset=half,
        radius_m=radius,
        center_lat=-90,
        scaling_factor=1.0,
        max_lat=max_lat,
    )
    rows, cols = np.mgrid[0:size, 0:size]
    x = (cols + 0.5 - half) * scale_m
    y = (half - rows - 0.5) * scale_m
    lat, lon = projection.to_latlon(x, y)
    return PolarDEM(np.asarray(height_fn(lat, lon), dtype=float), projection, name="synthetic")
