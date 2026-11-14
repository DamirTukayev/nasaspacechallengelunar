"""Sun and Earth positions for a site, cached by UTC day.

A Horizons request costs about 1 s however short it is, plus ~0.5 ms per row. Caching whole
requests meant that "the next lunar day from today" missed the cache every day, because its
start moves. Instead each body's table is stored one UTC day per entry, and a request is
assembled from those days:

- every missing day is fetched in ONE request (many small ones would each pay the 1 s);
- that request reaches LOOKAHEAD ahead of the first missing day, since 90 days cost ~2.5 s
  against ~1.8 s for 30: after one visit, shifted dates are free for weeks;
- long ranges (a year) still go out as a single request, as before.

Days are keyed by the step and by the grid's phase within the day (start time mod step), so
any grid that divides a day evenly can be cached. Anything else falls back to caching the
whole request.
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache

from app.config import get_settings
from app.services.disk_cache import JsonDiskCache
from app.services.horizons import EARTH, SUN, AzElSeries, HorizonsClient, HorizonsError
from app.services.time_grid import to_utc

DAY = timedelta(days=1)
LOOKAHEAD = timedelta(days=90)
# Fetching ahead is free only while it stays small; never let it grow a request past this.
MAX_LOOKAHEAD_ROWS = 15_000


@dataclass(frozen=True)
class Ephemeris:
    """Sun and Earth positions over the site's horizon on a shared time grid (UTC)."""

    times: list[datetime]
    sun: AzElSeries
    earth: AzElSeries


def _day_start(t: datetime) -> datetime:
    return t.replace(hour=0, minute=0, second=0, microsecond=0)


def day_cacheable(start: datetime, step_minutes: int, cache: JsonDiskCache | None) -> bool:
    """Grids that repeat every day with the same phase, starting on a whole minute."""
    return (
        cache is not None
        and 1440 % step_minutes == 0
        and start.second == 0
        and (start.microsecond == 0)
    )


def _day_key(
    target: str, lat: float, lon: float, alt_m: float, step: int, phase: int, day: datetime
) -> str:
    return JsonDiskCache.make_key(
        {
            "kind": "horizons-day",
            "target": target,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            # Horizons gets the altitude in km to 4 decimals; finer differences are the same site.
            "alt_km": round(alt_m / 1000, 4),
            "step_minutes": step,
            "phase_minutes": phase,
            "day": day.date().isoformat(),
        }
    )


async def _series_by_day(
    client: HorizonsClient,
    target: str,
    lat: float,
    lon: float,
    alt_m: float,
    start: datetime,
    stop: datetime,
    step_minutes: int,
    require_cache: bool = False,
) -> AzElSeries:
    cache = client.cache
    assert cache is not None
    step = timedelta(minutes=step_minutes)
    first_day = _day_start(start)
    phase = (start - first_day) % step
    phase_minutes = int(phase.total_seconds() // 60)
    rows_per_day = -(-(1440 - phase_minutes) // step_minutes)  # ceil

    days: list[datetime] = []
    d = first_day
    while d <= stop:
        days.append(d)
        d += DAY

    def key(day: datetime) -> str:
        return _day_key(target, lat, lon, alt_m, step_minutes, phase_minutes, day)

    stored = {day: cache.get(key(day)) for day in days}
    missing = [day for day, value in stored.items() if value is None]

    if missing:
        fetch_start = missing[0] + phase
        needed_end = missing[-1] + DAY - timedelta(minutes=1)
        ahead = min(fetch_start + LOOKAHEAD, fetch_start + step * (MAX_LOOKAHEAD_ROWS - 1))
        target_end = max(needed_end, ahead)
        fetch_stop = fetch_start + step * ((target_end - fetch_start) // step)

        fetched = await client.az_el(
            target, lat, lon, alt_m, fetch_start, fetch_stop, step_minutes, use_cache=False
        )

        by_day: dict[datetime, dict[str, list]] = {}
        for t, az, el in zip(fetched.times, fetched.azimuth, fetched.elevation, strict=True):
            day = by_day.setdefault(_day_start(t), {"times": [], "azimuth": [], "elevation": []})
            day["times"].append(t.isoformat())
            day["azimuth"].append(az)
            day["elevation"].append(el)

        for day, value in by_day.items():
            # The last day of the look-ahead is usually cut short: never store a partial day.
            if len(value["times"]) == rows_per_day:
                cache.set(key(day), value)
                if day in stored:
                    stored[day] = value

    if any(stored[day] is None for day in days):
        raise HorizonsError("Horizons returned an incomplete table for the requested days")

    if require_cache and any(cache.get(key(day)) is None for day in days):
        raise OSError("Ephemeris warmup could not persist the requested days")

    times: list[datetime] = []
    azimuth: list[float] = []
    elevation: list[float] = []
    for day in days:
        series = AzElSeries.from_json(stored[day])
        for t, az, el in zip(series.times, series.azimuth, series.elevation, strict=True):
            if start <= t <= stop:
                times.append(t)
                azimuth.append(az)
                elevation.append(el)
    return AzElSeries(times=times, azimuth=azimuth, elevation=elevation)


async def _series(
    client: HorizonsClient,
    target: str,
    lat: float,
    lon: float,
    alt_m: float,
    start: datetime,
    stop: datetime,
    step_minutes: int,
    require_cache: bool = False,
) -> AzElSeries:
    if day_cacheable(start, step_minutes, client.cache):
        return await _series_by_day(
            client, target, lat, lon, alt_m, start, stop, step_minutes, require_cache
        )
    if require_cache:
        raise ValueError("Warmup requires a disk cache and a cacheable daily grid")
    return await client.az_el(target, lat, lon, alt_m, start, stop, step_minutes)


async def get_ephemeris(
    client: HorizonsClient,
    lat: float,
    lon: float,
    alt_m: float,
    start: datetime,
    stop: datetime,
    step_minutes: int,
    *,
    require_cache: bool = False,
) -> Ephemeris:
    start, stop = to_utc(start), to_utc(stop)
    sun, earth = await asyncio.gather(
        _series(client, SUN, lat, lon, alt_m, start, stop, step_minutes, require_cache),
        _series(client, EARTH, lat, lon, alt_m, start, stop, step_minutes, require_cache),
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
