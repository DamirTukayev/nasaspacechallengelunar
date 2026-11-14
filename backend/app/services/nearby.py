"""How sunlight and Earth visibility change across a grid of spots around a site.

Moving a few kilometres can turn a dark crater floor into a sunlit ridge. For every node of a
square grid around the site we compute its own skyline from the DEM and run the same analysis
as for a single site.

One Horizons ephemeris (for the centre) serves the whole grid. The Sun and the Earth are so far
away that their direction in Moon-fixed coordinates is the same at every node; only the local
horizontal plane tilts as we move (about 0.03° per km). So the centre's azimuth/elevation are
turned into Moon-fixed directions once and projected onto each node's local frame. Checked
against Horizons 7 km away: 0.0001° for the Sun, 0.001° for the Earth.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from app.schemas.analysis import Metrics
from app.services.analysis import analyze
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import Ephemeris
from app.services.horizon_mask import TerrainHorizon
from app.services.horizons import AzElSeries
from app.terrain.dem import PolarDEM
from app.terrain.geometry import enu_axes, projected_axes
from app.terrain.horizon import MAX_DISTANCE_M, compute_horizon

# A 1° skyline is twice as fast as the 0.5° one used for single sites, and differs from it by
# at most ~0.07° (measured at Mons Malapert). The full 200 km reach is kept: cutting it to
# 100 km already moves the skyline by up to 3°.
GRID_AZIMUTH_STEP_DEG = 1.0
MAX_WORKERS = min(4, os.cpu_count() or 1)


@dataclass(frozen=True)
class Grid:
    east_m: NDArray  # (n,) column offsets, west → east
    north_m: NDArray  # (n,) row offsets, north → south
    lats: NDArray  # (n, n)
    lons: NDArray  # (n, n)


@dataclass(frozen=True)
class Spot:
    lat: float
    lon: float
    site_alt_m: float
    metrics: Metrics


def grid_around(dem: PolarDEM, lat: float, lon: float, half_extent_m: float, step_m: float) -> Grid:
    """Nodes on a regular east/north grid centred on the site. Row 0 is the north edge."""
    n_side = int(round(half_extent_m / step_m))
    axis = np.arange(-n_side, n_side + 1) * step_m
    east, north = np.meshgrid(axis, axis[::-1])

    proj = dem.projection
    # As in compute_horizon: "north" is undefined exactly at the pole, so step off it.
    lat_c = max(lat, -89.9999)
    x0, y0 = proj.to_xy(lat_c, lon)
    north_xy, east_xy, scale = projected_axes(dem, lat_c, lon)
    xs = x0 + (east * east_xy[0] + north * north_xy[0]) * scale
    ys = y0 + (east * east_xy[1] + north * north_xy[1]) * scale
    lats, lons = proj.to_latlon(xs, ys)
    return Grid(east_m=axis, north_m=axis[::-1], lats=lats, lons=lons)


def _directions(series: AzElSeries, lat: float, lon: float) -> NDArray:
    """(N, 3) Moon-fixed unit vectors toward a body, from its az/el at (lat, lon)."""
    east, north, up = enu_axes(lat, lon)
    az = np.radians(series.azimuth)
    el = np.radians(series.elevation)
    return (
        (np.cos(el) * np.sin(az))[:, None] * east
        + (np.cos(el) * np.cos(az))[:, None] * north
        + np.sin(el)[:, None] * up
    )


def local_az_el(directions: NDArray, lat: float, lon: float) -> tuple[list[float], list[float]]:
    """Azimuth (from north, clockwise) and elevation of Moon-fixed directions at (lat, lon)."""
    east, north, up = enu_axes(lat, lon)
    az = np.degrees(np.arctan2(directions @ east, directions @ north)) % 360
    el = np.degrees(np.arcsin(np.clip(directions @ up, -1.0, 1.0)))
    return az.tolist(), el.tolist()


def grid_skyline(
    dem: PolarDEM, lat: float, lon: float, observer_height_m: float, cache: JsonDiskCache
) -> tuple[TerrainHorizon, float] | None:
    """1° skyline of one grid node and its ground height; None off the DEM."""
    key = JsonDiskCache.make_key(
        {
            "dem": dem.name,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "observer_height_m": observer_height_m,
            "step": GRID_AZIMUTH_STEP_DEG,
            "max_distance_m": MAX_DISTANCE_M,
        }
    )
    cached = cache.get(key)
    if cached is None:
        try:
            profile = compute_horizon(
                dem, lat, lon, observer_height_m, azimuth_step_deg=GRID_AZIMUTH_STEP_DEG
            )
        except ValueError:  # outside the DEM
            return None
        cached = {
            "azimuths": profile.azimuths.round(3).tolist(),
            "elevations": profile.elevations.round(4).tolist(),
            "site_alt_m": round(profile.site_alt_m, 1),
        }
        cache.set(key, cached)
    return TerrainHorizon(cached["azimuths"], cached["elevations"]), cached["site_alt_m"]


def grid_nodes(grid: Grid) -> list[tuple[float, float]]:
    return list(zip(grid.lats.ravel().tolist(), grid.lons.ravel().tolist(), strict=True))


def grid_skylines(
    dem: PolarDEM, grid: Grid, observer_height_m: float, cache: JsonDiskCache
) -> list[tuple[TerrainHorizon, float] | None]:
    """Skylines of every node, row-major, computed in parallel or read from the cache."""
    # Skylines are the expensive part, and NumPy releases the GIL while computing them.
    with ThreadPoolExecutor(MAX_WORKERS) as pool:
        return list(
            pool.map(
                lambda p: grid_skyline(dem, p[0], p[1], observer_height_m, cache), grid_nodes(grid)
            )
        )


def analyze_grid(
    eph: Ephemeris,
    dem: PolarDEM,
    grid: Grid,
    center_lat: float,
    center_lon: float,
    observer_height_m: float,
    min_earth_elevation_deg: float,
    cache: JsonDiskCache,
) -> list[Spot | None]:
    """Metrics for every grid node, row-major; None where the node is off the DEM."""
    sun_dirs = _directions(eph.sun, center_lat, center_lon)
    earth_dirs = _directions(eph.earth, center_lat, center_lon)
    nodes = grid_nodes(grid)
    skylines = grid_skylines(dem, grid, observer_height_m, cache)

    spots: list[Spot | None] = []
    for (lat, lon), skyline in zip(nodes, skylines, strict=True):
        if skyline is None:
            spots.append(None)
            continue
        mask, site_alt = skyline
        sun_az, sun_el = local_az_el(sun_dirs, lat, lon)
        earth_az, earth_el = local_az_el(earth_dirs, lat, lon)
        local = Ephemeris(
            times=eph.times,
            sun=AzElSeries(eph.times, sun_az, sun_el),
            earth=AzElSeries(eph.times, earth_az, earth_el),
        )
        result = analyze(local, mask, min_earth_elevation_deg)
        spots.append(Spot(lat=lat, lon=lon, site_alt_m=site_alt, metrics=result.metrics))
    return spots


def best_spot(spots: list[Spot | None]) -> int | None:
    """Most time with both Sun and Earth; ties go to more sunlight, then the shorter night."""
    scored = [
        (s.metrics.both_pct, s.metrics.sunlit_pct, -s.metrics.longest_dark_hours, -i)
        for i, s in enumerate(spots)
        if s is not None
    ]
    return -max(scored)[3] if scored else None
