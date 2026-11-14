"""Warm the catalog's default hourly grids; refresh daily while the API runs."""

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.schemas.site import Site
from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizon_mask import get_dem
from app.services.site_catalog import get_sites

log = logging.getLogger(__name__)


RETRY_INITIAL_SECONDS = 15
RETRY_MAX_SECONDS = 300
REFRESH_SECONDS = 86400


@dataclass(frozen=True)
class WarmResult:
    warmed: int
    failed: tuple[Site, ...]


async def warm_catalog(sites: Sequence[Site] | None = None) -> WarmResult:
    client = get_horizons_client()
    dem = await asyncio.to_thread(get_dem)
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    stop = start + timedelta(days=30)
    warmed = 0
    failed: list[Site] = []
    # Keep startup warming from filling the foreground queue with the entire catalog.
    for site in get_sites() if sites is None else sites:
        try:
            altitude = 0.0
            if dem is not None and dem.covers(site.lat):
                altitude = round(
                    float(await asyncio.to_thread(dem.height, max(site.lat, -89.9999), site.lon)), 1
                )
            await get_ephemeris(client, site.lat, site.lon, altitude, start, stop, 60)
            warmed += 1
        except Exception:
            failed.append(site)
            log.exception("Could not warm ephemerides for %s", site.id)
    log.info("Warmed hourly ephemerides for %d catalog sites", warmed)
    return WarmResult(warmed, tuple(failed))


async def refresh_catalog() -> None:
    pending: tuple[Site, ...] | None = None
    retry_delay = RETRY_INITIAL_SECONDS
    while True:
        try:
            result = await warm_catalog(pending)
        except Exception:
            log.exception("Ephemeris warmup failed; API requests can still fetch on demand")
        else:
            if not result.failed:
                pending = None
                retry_delay = RETRY_INITIAL_SECONDS
                await asyncio.sleep(REFRESH_SECONDS)
                continue
            pending = result.failed
        await asyncio.sleep(retry_delay)
        retry_delay = min(retry_delay * 2, RETRY_MAX_SECONDS)


def main() -> int:
    logging.basicConfig(level=logging.INFO)
    try:
        result = asyncio.run(warm_catalog())
    except Exception:
        log.exception("Catalog warmup could not start")
        return 1
    if result.failed:
        log.error("Catalog warmup incomplete: %s", ", ".join(site.id for site in result.failed))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
