"""Precompute everything that does not depend on dates for the catalog's polar sites.

    python -m app.scripts.warm_cache

For every catalog site on the DEM it stores, in the disk cache:
- the site's skyline (what /api/analyze and /api/horizon use),
- the skylines of every node of the default nearby map (/api/nearby, the slow part),
- the 3D terrain patch (/api/terrain).

The Docker build runs it, so on a small hosted CPU these load at once instead of after a long
computation. Ephemerides are not stored: they depend on the dates people pick.
"""

import sys
import time

from app.api.terrain import DEFAULT_HALF_EXTENT_KM, DEFAULT_SIZE, build_terrain, get_terrain_cache
from app.schemas.nearby import DEFAULT_HALF_EXTENT_KM as GRID_HALF_EXTENT_KM
from app.schemas.nearby import DEFAULT_STEP_KM as GRID_STEP_KM
from app.schemas.nearby import SUNLIGHT_MAP_HALF_EXTENT_KM, SUNLIGHT_MAP_STEP_KM
from app.services.horizon_mask import get_dem, get_horizon_cache, horizon_for_site
from app.services.nearby import grid_around, grid_skylines
from app.services.site_catalog import get_sites
from app.terrain.horizon import DEFAULT_OBSERVER_HEIGHT_M


def warm(out=sys.stdout) -> int:
    """Returns the number of sites warmed."""
    dem = get_dem()
    if dem is None:
        print("No DEM: nothing to precompute (horizons are flat without terrain).", file=out)
        return 0

    sites = [s for s in get_sites() if dem.covers(s.lat)]
    horizon_cache = get_horizon_cache()
    terrain_cache = get_terrain_cache()
    started = time.perf_counter()

    for site in sites:
        t = time.perf_counter()
        horizon_for_site(site.lat, site.lon, DEFAULT_OBSERVER_HEIGHT_M, dem, horizon_cache)
        grid = grid_around(dem, site.lat, site.lon, GRID_HALF_EXTENT_KM * 1000, GRID_STEP_KM * 1000)
        grid_skylines(dem, grid, DEFAULT_OBSERVER_HEIGHT_M, horizon_cache)
        # The sunlight map on the 3D terrain in Mission Control: the whole ±20 km patch.
        sunlight = grid_around(
            dem,
            site.lat,
            site.lon,
            SUNLIGHT_MAP_HALF_EXTENT_KM * 1000,
            SUNLIGHT_MAP_STEP_KM * 1000,
        )
        grid_skylines(dem, sunlight, DEFAULT_OBSERVER_HEIGHT_M, horizon_cache)
        build_terrain(
            site.lat, site.lon, DEFAULT_HALF_EXTENT_KM * 1000, DEFAULT_SIZE, dem, terrain_cache
        )
        print(
            f"  {site.name}: {grid.lats.size} + {sunlight.lats.size} map nodes,"
            f" {time.perf_counter() - t:.1f}s",
            file=out,
        )

    print(f"Precomputed {len(sites)} polar sites in {time.perf_counter() - started:.1f}s", file=out)
    return len(sites)


if __name__ == "__main__":
    warm()
