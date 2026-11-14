import asyncio
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache

from app.config import get_settings
from app.services.disk_cache import JsonDiskCache
from app.services.horizons import EARTH, SUN, AzElSeries, HorizonsClient, HorizonsError


@dataclass(frozen=True)
class Ephemeris:
    """Sun and Earth positions over the site's horizon on a shared time grid (UTC)."""

    times: list[datetime]
    sun: AzElSeries
    earth: AzElSeries


async def get_ephemeris(
    client: HorizonsClient,
    lat: float,
    lon: float,
    alt_m: float,
    start: datetime,
    stop: datetime,
    step_minutes: int,
) -> Ephemeris:
    sun, earth = await asyncio.gather(
        client.az_el(SUN, lat, lon, alt_m, start, stop, step_minutes),
        client.az_el(EARTH, lat, lon, alt_m, start, stop, step_minutes),
    )
    if sun.times != earth.times:
        raise HorizonsError("Sun and Earth tables have different time grids")
    return Ephemeris(times=sun.times, sun=sun, earth=earth)


@lru_cache
def get_horizons_client() -> HorizonsClient:
    settings = get_settings()
    return HorizonsClient(
        base_url=settings.horizons_url,
        timeout_s=settings.horizons_timeout_s,
        cache=JsonDiskCache(settings.cache_dir / "horizons"),
    )
