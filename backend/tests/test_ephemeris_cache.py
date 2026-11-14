"""The by-day ephemeris cache must give exactly what one direct Horizons request gives."""

import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import LOOKAHEAD, get_ephemeris
from app.services.horizons import HorizonsClient
from tests.fakes import SyntheticHorizons

SITE = {"lat": -85.98, "lon": -1.67, "alt_m": 4920.0}
T0 = datetime(2026, 12, 1, tzinfo=UTC)


def make_client(fake: SyntheticHorizons, cache: JsonDiskCache | None) -> HorizonsClient:
    return HorizonsClient(
        "https://horizons.test/api", cache=cache, transport=httpx.MockTransport(fake)
    )


def ephemeris(client: HorizonsClient, start: datetime, stop: datetime, step: int = 60):
    return asyncio.run(get_ephemeris(client, start=start, stop=stop, step_minutes=step, **SITE))


@pytest.fixture
def cached(tmp_path):
    fake = SyntheticHorizons()
    return fake, make_client(fake, JsonDiskCache(tmp_path))


def direct(start: datetime, stop: datetime, step: int = 60):
    """One plain request, no cache: the reference."""
    return ephemeris(make_client(SyntheticHorizons(), None), start, stop, step)


LUNAR_DAY = timedelta(days=29, hours=12, minutes=44)


@pytest.mark.parametrize(
    ("start", "step"),
    [
        (T0, 60),  # the app's default: midnight, hourly
        (T0 + timedelta(hours=13, minutes=27), 60),  # an odd start: grid phase 27 min
        (T0, 10),
        (T0 + timedelta(minutes=5), 360),
    ],
)
def test_matches_a_direct_request(cached, start, step) -> None:
    _, client = cached
    stop = start + LUNAR_DAY

    got = ephemeris(client, start, stop, step)
    want = direct(start, stop, step)

    assert got.times == want.times
    assert got.sun.azimuth == want.sun.azimuth and got.sun.elevation == want.sun.elevation
    assert got.earth.azimuth == want.earth.azimuth and got.earth.elevation == want.earth.elevation


def test_tomorrows_default_range_needs_no_request(cached) -> None:
    fake, client = cached
    ephemeris(client, T0, T0 + LUNAR_DAY)
    assert len(fake.requests) == 2  # Sun and Earth

    for shift in (1, 7, 30):
        start = T0 + timedelta(days=shift)
        got = ephemeris(client, start, start + LUNAR_DAY)
        assert got.times == direct(start, start + LUNAR_DAY).times

    assert len(fake.requests) == 2


def test_lookahead_is_one_request_reaching_90_days(cached) -> None:
    fake, client = cached
    ephemeris(client, T0, T0 + timedelta(days=1))

    stops = {r.url.params["STOP_TIME"] for r in fake.requests}
    assert stops == {f"'{(T0 + LOOKAHEAD):%Y-%m-%d %H:%M}'"}


def test_beyond_the_lookahead_fetches_only_the_missing_part(cached) -> None:
    fake, client = cached
    ephemeris(client, T0, T0 + LUNAR_DAY)
    start = T0 + timedelta(days=80)

    got = ephemeris(client, start, start + LUNAR_DAY)

    assert got.times == direct(start, start + LUNAR_DAY).times
    new = fake.requests[2:]
    assert len(new) == 2
    # Day 80 is already cached; the new request starts at the first missing day.
    assert {r.url.params["START_TIME"] for r in new} == {f"'{(T0 + LOOKAHEAD):%Y-%m-%d %H:%M}'"}


def test_a_year_is_still_one_request_per_body(cached) -> None:
    fake, client = cached
    got = ephemeris(client, T0, T0 + timedelta(days=365))
    assert len(got.times) == 365 * 24 + 1
    assert len(fake.requests) == 2


@pytest.mark.parametrize(
    ("start", "step"),
    [
        (T0, 7),  # 7 min does not divide a day evenly
        (T0 + timedelta(seconds=30), 60),  # not on a whole minute
    ],
)
def test_other_grids_fall_back_to_whole_request_caching(cached, start, step) -> None:
    fake, client = cached
    stop = start + timedelta(days=2)

    first = ephemeris(client, start, stop, step)
    second = ephemeris(client, start, stop, step)

    assert first.times == second.times
    assert len(fake.requests) == 2  # cached as a whole the first time
    assert fake.requests[0].url.params["STOP_TIME"] == f"'{stop:%Y-%m-%d %H:%M}'"  # no look-ahead
