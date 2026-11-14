from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from app.schemas.landing import LandingSearchResponse
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizon_mask import get_dem
from app.services.horizons import HorizonsClient, HorizonsError
from app.services.landing import REFERENCE_SITE, search
from app.services.landing_api import (
    LandingParams,
    build_response,
    get_hydrogen,
    get_landing_cache,
)
from app.terrain.dem import PolarDEM
from app.terrain.hydrogen import HydrogenMap

router = APIRouter(prefix="/api/landing-search", tags=["landing"])

DEFAULT_START = datetime(2027, 1, 1, tzinfo=UTC)
DEFAULT_END = datetime(2028, 1, 1, tzinfo=UTC)


@router.get("", response_model=LandingSearchResponse)
async def landing_search(
    client: Annotated[HorizonsClient, Depends(get_horizons_client)],
    dem: Annotated[PolarDEM | None, Depends(get_dem)],
    hydrogen: Annotated[HydrogenMap | None, Depends(get_hydrogen)],
    cache: Annotated[JsonDiskCache, Depends(get_landing_cache)],
    radius_km: Annotated[float, Query(ge=20, le=140)] = 80.0,
    spacing_km: Annotated[float, Query(ge=2, le=20)] = 5.0,
    start: datetime = DEFAULT_START,
    end: datetime = DEFAULT_END,
    step_minutes: Annotated[int, Query(ge=60, le=1440)] = 360,
) -> dict:
    """Score a grid around the south pole on terrain, light, Earth link and resources."""
    if dem is None:
        raise HTTPException(503, "No LOLA DEM; run python -m app.scripts.fetch_dem")
    if hydrogen is None:
        raise HTTPException(503, "No hydrogen map; run python -m app.scripts.fetch_resources")

    params = LandingParams(radius_km, spacing_km, start, end, step_minutes, dem.name)
    key = JsonDiskCache.make_key(params.cache_parts())
    cached = cache.get(key)
    if cached is not None:
        return cached

    ref_lat, ref_lon = REFERENCE_SITE
    try:
        eph = await get_ephemeris(
            client, ref_lat, ref_lon, 0.0, params.start, params.end, step_minutes
        )
    except HorizonsError as exc:
        raise HTTPException(502, str(exc)) from exc

    result = await run_in_threadpool(search, dem, hydrogen, eph, radius_km, spacing_km)
    payload = await run_in_threadpool(build_response, result, dem, eph, params)
    cache.set(key, payload)
    return payload
