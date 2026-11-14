"""Terrain horizon ("skyline") of a point on the Moon from a polar DEM.

For every azimuth we march outward from the observer, sample the terrain and keep the highest
elevation angle. Angles are computed from exact 3D positions on the sphere, so the Moon's
curvature is accounted for: distant terrain sinks below the observer's horizontal plane.
There is no atmosphere, so no refraction.
"""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from app.terrain.dem import PolarDEM
from app.terrain.geometry import projected_axes, unit_vectors

AZIMUTH_STEP_DEG = 0.5
MAX_DISTANCE_M = 200_000.0
DEFAULT_OBSERVER_HEIGHT_M = 2.0


@dataclass(frozen=True)
class HorizonProfile:
    azimuths: NDArray  # degrees from north, clockwise
    elevations: NDArray  # degrees; may be negative when the observer stands high
    site_alt_m: float  # terrain height under the observer, relative to the sphere
    observer_height_m: float
    # Where each ray meets the skyline: the terrain sample with the highest elevation angle.
    # NaN for a ray with no terrain at all (entirely off the DEM).
    hit_distance_m: NDArray
    hit_height_m: NDArray  # relative to the 1737.4 km sphere
    hit_lat: NDArray
    hit_lon: NDArray
    terrain_samples: int  # terrain points actually evaluated (on the DEM)


def _sample_distances(pixel_m: float, max_distance_m: float) -> NDArray:
    """Half-pixel steps nearby, growing with distance where small details matter less."""
    distances = [pixel_m / 2]
    while distances[-1] < max_distance_m:
        d = distances[-1]
        distances.append(d + max(pixel_m / 2, d * 0.004))
    return np.array(distances)


def compute_horizon(
    dem: PolarDEM,
    lat: float,
    lon: float,
    observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M,
    azimuth_step_deg: float = AZIMUTH_STEP_DEG,
    max_distance_m: float = MAX_DISTANCE_M,
) -> HorizonProfile:
    proj = dem.projection
    # Directions are undefined exactly at the pole; step off it along the given meridian.
    lat = max(lat, -89.9999)

    site_alt = dem.height(lat, lon)
    if np.isnan(site_alt):
        raise ValueError(f"({lat}, {lon}) is outside the DEM")

    x0, y0 = proj.to_xy(lat, lon)
    north, east, _ = projected_axes(dem, lat, lon)

    azimuths = np.arange(0.0, 360.0, azimuth_step_deg)
    az_r = np.radians(azimuths)
    # (n_az, 2): direction of each ray in the projected plane.
    directions = np.cos(az_r)[:, None] * north + np.sin(az_r)[:, None] * east
    distances = _sample_distances(dem.sample_scale(lat, lon), max_distance_m)

    xs = x0 + directions[:, 0:1] * distances[None, :]
    ys = y0 + directions[:, 1:2] * distances[None, :]
    heights = dem.sample_xy(xs.ravel(), ys.ravel()).reshape(xs.shape)
    lats, lons = proj.to_latlon(xs, ys)

    radius = proj.radius_m
    up = unit_vectors(np.array(lat), np.array(lon))
    observer = (radius + site_alt + observer_height_m) * up
    targets = (radius + heights)[..., None] * unit_vectors(lats, lons)
    offsets = targets - observer
    sin_el = (offsets @ up) / np.linalg.norm(offsets, axis=-1)
    angles = np.degrees(np.arcsin(np.clip(sin_el, -1, 1)))

    # Samples off the DEM are NaN; the horizon there is unknown, so they simply don't count.
    on_dem = ~np.isnan(angles)
    ranked = np.where(on_dem, angles, -90.0)
    best = np.argmax(ranked, axis=1)
    rows = np.arange(len(azimuths))
    elevations = ranked[rows, best]
    has_terrain = on_dem.any(axis=1)

    def at_hit(values: NDArray) -> NDArray:
        return np.where(has_terrain, values[rows, best], np.nan)

    return HorizonProfile(
        azimuths=azimuths,
        elevations=elevations,
        site_alt_m=site_alt,
        observer_height_m=observer_height_m,
        hit_distance_m=np.where(has_terrain, distances[best], np.nan),
        hit_height_m=at_hit(heights),
        hit_lat=at_hit(lats),
        hit_lon=at_hit(lons),
        terrain_samples=int(on_dem.sum()),
    )
