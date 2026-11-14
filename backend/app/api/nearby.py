from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.config import get_settings
from app.schemas.nearby import NearbyRequest, NearbyResponse, NearbySpot, NearbyTimelines
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizon_mask import get_dem, get_horizon_cache
from app.services.horizons import HorizonsClient, HorizonsError
from app.services.nearby import (
    GRID_AZIMUTH_STEP_DEG,
    analyze_grid,
    best_spot,
    grid_around,
    pack_bits,
)
from app.terrain.dem import PolarDEM

router = APIRouter(prefix="/api/nearby", tags=["analysis"])


def get_nearby_cache() -> JsonDiskCache:
    return JsonDiskCache(get_settings().cache_dir / "nearby")


@router.post("", response_model=NearbyResponse)
async def analyze_nearby(
    scenario: NearbyRequest,
    client: Annotated[HorizonsClient, Depends(get_horizons_client)],
    dem: Annotated[PolarDEM | None, Depends(get_dem)],
    cache: Annotated[JsonDiskCache, Depends(get_nearby_cache)],
    skyline_cache: Annotated[JsonDiskCache, Depends(get_horizon_cache)],
) -> NearbyResponse:
    """Sunlight and Earth visibility on a grid of spots around a site (LOLA terrain only)."""
    if dem is None:
        raise HTTPException(503, "No terrain model on the server; the map needs the LOLA DEM")
    if not dem.covers(scenario.lat):
        raise HTTPException(
            422, f"The map needs terrain, available south of {dem.projection.max_lat:.0f}°"
        )

    key = JsonDiskCache.make_key({"dem": dem.name, **scenario.model_dump(mode="json")})
    cached = cache.get(key)
    if cached is not None:
        return NearbyResponse.model_validate(cached)

    grid = grid_around(
        dem, scenario.lat, scenario.lon, scenario.half_extent_km * 1000, scenario.step_km * 1000
    )
    center_alt = dem.height(max(scenario.lat, -89.9999), scenario.lon)
    try:
        eph = await get_ephemeris(
            client,
            scenario.lat,
            scenario.lon,
            scenario.alt_m if scenario.alt_m is not None else center_alt,
            scenario.start,
            scenario.end,
            scenario.step_minutes,
        )
    except HorizonsError as exc:
        raise HTTPException(502, str(exc)) from exc

    spots = await run_in_threadpool(
        analyze_grid,
        eph,
        dem,
        grid,
        scenario.lat,
        scenario.lon,
        scenario.observer_height_m,
        scenario.min_earth_elevation_deg,
        skyline_cache,
    )

    response = NearbyResponse(
        center_lat=scenario.lat,
        center_lon=scenario.lon,
        east_m=grid.east_m.tolist(),
        north_m=grid.north_m.tolist(),
        spots=[
            None
            if s is None
            else NearbySpot(
                lat=s.lat,
                lon=s.lon,
                site_alt_m=s.site_alt_m,
                sunlit_pct=s.metrics.sunlit_pct,
                earth_visible_pct=s.metrics.earth_visible_pct,
                both_pct=s.metrics.both_pct,
                longest_dark_hours=s.metrics.longest_dark_hours,
                longest_no_earth_hours=s.metrics.longest_no_earth_hours,
                verdict=s.metrics.verdict,
            )
            for s in spots
        ],
        best_index=best_spot(spots),
        timelines=NearbyTimelines(
            samples=len(eph.times),
            sun=[None if s is None else pack_bits(s.sun_visible) for s in spots],
            earth=[None if s is None else pack_bits(s.earth_visible) for s in spots],
        )
        if scenario.include_timelines
        else None,
        dem=dem.name,
        azimuth_step_deg=GRID_AZIMUTH_STEP_DEG,
    )
    cache.set(key, response.model_dump(mode="json"))
    return response
