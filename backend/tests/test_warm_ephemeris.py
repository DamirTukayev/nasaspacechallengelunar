import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx

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
        assert await warm_ephemeris.warm_catalog() == 1
        assert len(fake.requests) == 2
        start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        await get_ephemeris(
            client, 0, 0, 0, start + timedelta(days=1), start + timedelta(days=31), 60
        )
        assert len(fake.requests) == 2

    asyncio.run(run())
