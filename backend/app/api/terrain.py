from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool

from app.config import get_settings
from app.schemas.terrain import TerrainResponse
from app.services.disk_cache import JsonDiskCache
from app.services.horizon_mask import get_dem
from app.terrain.dem import PolarDEM
from app.terrain.patch import sphere_patch, terrain_patch

# What the 3D view asks for (it sends no size parameters).
DEFAULT_HALF_EXTENT_KM = 20.0
DEFAULT_SIZE = 201

router = APIRouter(prefix="/api/terrain", tags=["terrain"])


def get_terrain_cache() -> JsonDiskCache:
    return JsonDiskCache(get_settings().cache_dir / "terrain")


def build_terrain(
    lat: float,
    lon: float,
    half_extent_m: float,
    size: int,
    dem: PolarDEM | None,
    cache: JsonDiskCache,
) -> TerrainResponse:
    if dem is None or not dem.covers(lat):
        patch = sphere_patch(half_extent_m, size)
        return TerrainResponse(
            kind="sphere",
            size=size,
            half_extent_m=half_extent_m,
            heights=patch.heights.round(1).ravel().tolist(),
            site_alt_m=None,
            dem=None,
        )

    key = JsonDiskCache.make_key(
        {"dem": dem.name, "lat": round(lat, 6), "lon": round(lon, 6), "h": half_extent_m, "n": size}
    )
    cached = cache.get(key)
    if cached is None:
        patch = terrain_patch(dem, lat, lon, half_extent_m, size)
        cached = {
            "heights": patch.heights.round(1).ravel().tolist(),
            "site_alt_m": round(float(patch.site_alt_m), 1),
        }
        cache.set(key, cached)

    return TerrainResponse(
        kind="terrain",
        size=size,
        half_extent_m=half_extent_m,
        heights=cached["heights"],
        site_alt_m=cached["site_alt_m"],
        dem=dem.name,
    )


@router.get("", response_model=TerrainResponse)
async def read_terrain(
    dem: Annotated[PolarDEM | None, Depends(get_dem)],
    cache: Annotated[JsonDiskCache, Depends(get_terrain_cache)],
    lat: Annotated[float, Query(ge=-90, le=90, description="Latitude, degrees")],
    lon: Annotated[float, Query(ge=-180, le=180, description="East longitude, degrees")],
    half_extent_km: Annotated[float, Query(ge=2, le=40)] = DEFAULT_HALF_EXTENT_KM,
    size: Annotated[int, Query(ge=33, le=257)] = DEFAULT_SIZE,
) -> TerrainResponse:
    """Heights around a site for 3D views: LOLA terrain south of 75°S, a bare sphere elsewhere."""
    return await run_in_threadpool(build_terrain, lat, lon, half_extent_km * 1000, size, dem, cache)
