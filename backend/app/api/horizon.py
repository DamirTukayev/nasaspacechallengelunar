from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool

from app.schemas.horizon import HorizonResponse
from app.services.disk_cache import JsonDiskCache
from app.services.horizon_mask import get_dem, get_horizon_cache, horizon_for_site
from app.terrain.dem import PolarDEM
from app.terrain.horizon import DEFAULT_OBSERVER_HEIGHT_M

router = APIRouter(prefix="/api/horizon", tags=["horizon"])


@router.get("", response_model=HorizonResponse)
async def read_horizon(
    dem: Annotated[PolarDEM | None, Depends(get_dem)],
    cache: Annotated[JsonDiskCache, Depends(get_horizon_cache)],
    lat: Annotated[float, Query(ge=-90, le=90, description="Latitude, degrees")],
    lon: Annotated[float, Query(ge=-180, le=180, description="East longitude, degrees")],
    observer_height_m: Annotated[float, Query(ge=0, le=100)] = DEFAULT_OBSERVER_HEIGHT_M,
) -> HorizonResponse:
    """Skyline around a site from LOLA terrain (south of 75°S), flat elsewhere."""
    horizon = await run_in_threadpool(horizon_for_site, lat, lon, observer_height_m, dem, cache)
    return HorizonResponse(
        kind=horizon.mask.kind,
        azimuths=horizon.azimuths,
        elevations=horizon.elevations,
        site_alt_m=horizon.site_alt_m,
        observer_height_m=horizon.observer_height_m,
        dem=horizon.dem_name,
    )
