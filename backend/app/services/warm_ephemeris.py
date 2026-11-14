"""Warm the catalog's default hourly grids; refresh daily while the API runs."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizon_mask import get_dem
from app.services.site_catalog import get_sites

log = logging.getLogger(__name__)


async def warm_catalog() -> int:
    client = get_horizons_client()
    dem = await asyncio.to_thread(get_dem)
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    stop = start + timedelta(days=30)
    warmed = 0
    # Keep startup warming from filling the foreground queue with the entire catalog.
    for site in get_sites():
        try:
            altitude = 0.0
            if dem is not None and dem.covers(site.lat):
                altitude = round(
                    float(await asyncio.to_thread(dem.height, max(site.lat, -89.9999), site.lon)), 1
                )
            await get_ephemeris(client, site.lat, site.lon, altitude, start, stop, 60)
            warmed += 1
        except Exception:
            log.exception("Could not warm ephemerides for %s", site.id)
    log.info("Warmed hourly ephemerides for %d catalog sites", warmed)
    return warmed


async def refresh_catalog() -> None:
    while True:
        try:
            await warm_catalog()
        except Exception:
            log.exception("Ephemeris warmup failed; API requests can still fetch on demand")
        await asyncio.sleep(86400)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(warm_catalog())
