from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.schemas.analysis import AnalyzeResponse, ScenarioRequest
from app.services.analysis import analyze
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizon_mask import get_dem, get_horizon_cache, horizon_for_site
from app.services.horizons import HorizonsClient, HorizonsError
from app.terrain.dem import PolarDEM

router = APIRouter(prefix="/api/analyze", tags=["analysis"])


@router.post("", response_model=AnalyzeResponse)
async def analyze_scenario(
    scenario: ScenarioRequest,
    client: Annotated[HorizonsClient, Depends(get_horizons_client)],
    dem: Annotated[PolarDEM | None, Depends(get_dem)],
    cache: Annotated[JsonDiskCache, Depends(get_horizon_cache)],
) -> AnalyzeResponse:
    """Sun and Earth visibility windows, metrics and a verdict for one site and time range."""
    horizon = await run_in_threadpool(
        horizon_for_site, scenario.lat, scenario.lon, scenario.observer_height_m, dem, cache
    )
    # Terrain height matters for the skyline; for Horizons a few km change almost nothing,
    # but use the best value we have.
    alt_m = scenario.alt_m if scenario.alt_m is not None else (horizon.site_alt_m or 0.0)

    try:
        eph = await get_ephemeris(
            client,
            scenario.lat,
            scenario.lon,
            alt_m,
            scenario.start,
            scenario.end,
            scenario.step_minutes,
        )
    except HorizonsError as exc:
        raise HTTPException(502, str(exc)) from exc

    result = analyze(eph, horizon.mask, scenario.min_earth_elevation_deg)
    result.site_alt_m = horizon.site_alt_m
    return result
