"""A square of terrain around a site, as heights in the site's local frame, for 3D views.

The grid is regular in local east/north meters centred on the site. Each value is the height
above the site's ground plane, from exact 3D positions on the sphere, so the Moon's curvature
is built in: far corners sag below the horizontal even on flat ground.
"""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from app.terrain.dem import PolarDEM
from app.terrain.geometry import enu_axes, projected_axes, unit_vectors

MOON_RADIUS_M = 1_737_400.0


@dataclass(frozen=True)
class TerrainPatch:
    heights: NDArray  # (size, size); row 0 is the north edge, column 0 the west edge
    half_extent_m: float
    site_alt_m: float | None  # None for a bare sphere
    valid: NDArray | None = None


def _grid(half_extent_m: float, size: int) -> tuple[NDArray, NDArray]:
    """East and north offsets of every grid node, rows north → south, columns west → east."""
    axis = np.linspace(-half_extent_m, half_extent_m, size)
    east, north = np.meshgrid(axis, axis[::-1])
    return east, north


def sphere_patch(half_extent_m: float, size: int) -> TerrainPatch:
    """Bare sphere: only the curvature drop."""
    east, north = _grid(half_extent_m, size)
    distance = np.hypot(east, north)
    heights = MOON_RADIUS_M * (np.cos(distance / MOON_RADIUS_M) - 1)
    return TerrainPatch(heights=heights, half_extent_m=half_extent_m, site_alt_m=None)


def terrain_patch(
    dem: PolarDEM, lat: float, lon: float, half_extent_m: float, size: int
) -> TerrainPatch:
    proj = dem.projection
    lat = max(lat, -89.9999)  # local axes are undefined exactly at the pole

    site_alt = dem.height(lat, lon)
    if np.isnan(site_alt):
        raise ValueError(f"({lat}, {lon}) is outside the DEM")

    east, north = _grid(half_extent_m, size)
    north_xy, east_xy, scale = projected_axes(dem, lat, lon)
    x0, y0 = proj.to_xy(lat, lon)
    xs = x0 + scale * (east * east_xy[0] + north * north_xy[0])
    ys = y0 + scale * (east * east_xy[1] + north * north_xy[1])

    heights = dem.sample_xy(xs.ravel(), ys.ravel()).reshape(xs.shape)
    lats, lons = proj.to_latlon(xs, ys)

    radius = proj.radius_m
    site = (radius + site_alt) * unit_vectors(lat, lon)
    points = (radius + heights)[..., None] * unit_vectors(lats, lons)
    _, _, up = enu_axes(lat, lon)
    local_up = (points - site) @ up

    # Off-grid samples (near the DEM edge) fall back to the bare-sphere surface.
    fallback = sphere_patch(half_extent_m, size).heights - site_alt
    valid = np.isfinite(local_up)
    local_up = np.where(valid, local_up, fallback)

    return TerrainPatch(
        heights=local_up, half_extent_m=half_extent_m, site_alt_m=site_alt, valid=valid
    )
