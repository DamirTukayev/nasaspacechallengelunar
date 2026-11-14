from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.config import get_settings
from app.schemas.calendar import CalendarRequest, CalendarResponse
from app.services.calendar import calendar_stop, landing_calendar
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizon_mask import get_dem, get_horizon_cache, horizon_for_site
from app.services.horizons import HorizonsClient, HorizonsError
from app.terrain.dem import PolarDEM

router = APIRouter(prefix="/api/calendar", tags=["analysis"])


def get_calendar_cache() -> JsonDiskCache:
    return JsonDiskCache(get_settings().cache_dir / "calendar")


@router.post("", response_model=CalendarResponse)
async def landing_date_calendar(
    scenario: CalendarRequest,
    client: Annotated[HorizonsClient, Depends(get_horizons_client)],
    dem: Annotated[PolarDEM | None, Depends(get_dem)],
    cache: Annotated[JsonDiskCache, Depends(get_calendar_cache)],
    skyline_cache: Annotated[JsonDiskCache, Depends(get_horizon_cache)],
) -> CalendarResponse:
    """The same mission landed on each of `days` consecutive dates: sunlight, Earth visibility
    and a verdict for every date. Works with or without terrain."""
    on_dem = dem is not None and dem.covers(scenario.lat)
    key = JsonDiskCache.make_key(
        {"v": 2, "dem": dem.name if on_dem else None, **scenario.model_dump(mode="json")}
    )
    cached = cache.get(key)
    if cached is not None:
        return CalendarResponse.model_validate(cached)

    horizon = await run_in_threadpool(
        horizon_for_site, scenario.lat, scenario.lon, scenario.observer_height_m, dem, skyline_cache
    )
    alt_m = scenario.alt_m if scenario.alt_m is not None else (horizon.site_alt_m or 0.0)

    try:
        eph = await get_ephemeris(
            client,
            scenario.lat,
            scenario.lon,
            alt_m,
            scenario.start,
            calendar_stop(scenario.start, scenario.end, scenario.days, scenario.step_minutes),
            scenario.step_minutes,
        )
    except HorizonsError as exc:
        raise HTTPException(502, str(exc)) from exc

    mission = scenario.end - scenario.start
    try:
        days = await run_in_threadpool(
            landing_calendar,
            eph,
            horizon.mask,
            mission,
            scenario.days,
            scenario.step_minutes,
            scenario.min_earth_elevation_deg,
        )
    except ValueError as exc:  # Horizons answered with fewer rows than asked for
        raise HTTPException(502, str(exc)) from exc

    response = CalendarResponse(
        horizon_kind=horizon.mask.kind,
        site_alt_m=horizon.site_alt_m,
        mission_hours=mission.total_seconds() / 3600,
        step_minutes=scenario.step_minutes,
        days=days,
    )
    cache.set(key, response.model_dump(mode="json"))
    return response
