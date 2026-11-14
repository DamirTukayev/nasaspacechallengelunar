import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest

from app.services import warm_ephemeris
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_ephemeris
from app.services.horizons import HorizonsClient
from tests.fakes import SyntheticHorizons


def test_warming_makes_default_catalog_dates_cache_only(tmp_path, monkeypatch):
    fake = SyntheticHorizons()
    client = HorizonsClient(
        "https://horizons.test", cache=JsonDiskCache(tmp_path), transport=httpx.MockTransport(fake)
    )
    monkeypatch.setattr(warm_ephemeris, "get_horizons_client", lambda: client)
    monkeypatch.setattr(warm_ephemeris, "get_dem", lambda: None)
    monkeypatch.setattr(
        warm_ephemeris, "get_sites", lambda: [SimpleNamespace(id="test", lat=0, lon=0)]
    )

    async def run():
        result = await warm_ephemeris.warm_catalog()
        assert result.warmed == 1
        assert result.failed == ()
        assert len(fake.requests) == 2
        start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        await get_ephemeris(
            client, 0, 0, 0, start + timedelta(days=1), start + timedelta(days=31), 60
        )
        assert len(fake.requests) == 2

    asyncio.run(run())


@pytest.fixture
def catalog(monkeypatch):
    sites = tuple(SimpleNamespace(id=str(i), lat=i, lon=0) for i in range(3))
    monkeypatch.setattr(warm_ephemeris, "get_sites", lambda: sites)
    monkeypatch.setattr(warm_ephemeris, "get_dem", lambda: None)
    monkeypatch.setattr(warm_ephemeris, "get_horizons_client", lambda: object())
    return sites


@pytest.mark.parametrize("failed", [set(), {1}, {0, 1, 2}])
def test_cli_reports_complete_partial_and_total_results(catalog, monkeypatch, failed):
    async def fetch(client, lat, *args):
        if lat in failed:
            raise RuntimeError("Upstream unavailable")

    monkeypatch.setattr(warm_ephemeris, "get_ephemeris", fetch)
    assert warm_ephemeris.main() == (1 if failed else 0)


def test_cli_reports_setup_failure(monkeypatch):
    def fail():
        raise OSError("DEM cannot be opened")

    monkeypatch.setattr(warm_ephemeris, "get_dem", fail)
    assert warm_ephemeris.main() == 1


def test_background_retries_only_failed_sites_then_resumes_daily(catalog, monkeypatch):
    calls = []
    delays = []

    async def fetch(client, lat, *args):
        calls.append(lat)
        if lat == 1 and calls.count(1) == 1:
            raise RuntimeError("Temporary failure")

    async def sleep(delay):
        delays.append(delay)
        if delay == warm_ephemeris.REFRESH_SECONDS:
            raise asyncio.CancelledError

    monkeypatch.setattr(warm_ephemeris, "get_ephemeris", fetch)
    monkeypatch.setattr(warm_ephemeris.asyncio, "sleep", sleep)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(warm_ephemeris.refresh_catalog())
    assert calls == [0, 1, 2, 1]
    assert delays == [15, 86400]


def test_setup_failure_backoff_is_bounded_and_cancellable(monkeypatch):
    delays = []

    async def fail(sites=None):
        raise OSError("Cache temporarily unavailable")

    async def sleep(delay):
        delays.append(delay)
        if len(delays) == 8:
            raise asyncio.CancelledError

    monkeypatch.setattr(warm_ephemeris, "warm_catalog", fail)
    monkeypatch.setattr(warm_ephemeris.asyncio, "sleep", sleep)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(warm_ephemeris.refresh_catalog())
    assert delays == [15, 30, 60, 120, 240, 300, 300, 300]


def test_success_resets_retry_backoff_and_refreshes_full_catalog(catalog, monkeypatch):
    calls = []
    delays = []
    outcomes = iter(
        [
            warm_ephemeris.WarmResult(2, (catalog[1],)),
            warm_ephemeris.WarmResult(0, (catalog[1],)),
            warm_ephemeris.WarmResult(1, ()),
            warm_ephemeris.WarmResult(2, (catalog[2],)),
        ]
    )

    async def warm(sites=None):
        calls.append(sites)
        return next(outcomes)

    async def sleep(delay):
        delays.append(delay)
        if len(delays) == 4:
            raise asyncio.CancelledError

    monkeypatch.setattr(warm_ephemeris, "warm_catalog", warm)
    monkeypatch.setattr(warm_ephemeris.asyncio, "sleep", sleep)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(warm_ephemeris.refresh_catalog())
    assert delays == [15, 30, 86400, 15]
    assert calls == [None, (catalog[1],), (catalog[1],), None]
