import json
import math
from datetime import UTC, datetime, timedelta
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


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


class SyntheticHorizons:
    """Answers any START/STOP/STEP with a smooth, time-dependent az/el table.

    On a flat horizon the Sun sets about 49 days after FIXTURE_START and the Earth after 43.
    """

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        p = request.url.params
        start = datetime.strptime(p["START_TIME"].strip("'"), "%Y-%m-%d %H:%M").replace(tzinfo=UTC)
        stop = datetime.strptime(p["STOP_TIME"].strip("'"), "%Y-%m-%d %H:%M").replace(tzinfo=UTC)
        step = timedelta(minutes=int(p["STEP_SIZE"].strip("'").split()[0]))
        sun = p["COMMAND"].strip("'") == SUN

        rows = []
        t = start
        while t <= stop:
            hours = (t - FIXTURE_START).total_seconds() / 3600
            az = (hours * (0.5 if sun else 0.03) + (0 if sun else 90)) % 360
            el = (1.5 if sun else 4) * math.sin(hours / (354 if sun else 330))
            stamp = f"{t.year}-{MONTHS[t.month - 1]}-{t.day:02d} {t:%H:%M}"
            rows.append(f" {stamp}, , ,{az:.9f},{el:.9f},")
            t += step
        result = "header\n$$SOE\n" + "\n".join(rows) + "\n$$EOE\nfooter"
        return httpx.Response(200, text=json.dumps({"result": result}))


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
