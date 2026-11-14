"""Small geometry helpers shared by horizon and terrain-patch calculations."""

import numpy as np
from numpy.typing import ArrayLike, NDArray

from app.terrain.dem import PolarDEM


def unit_vectors(lat: ArrayLike, lon: ArrayLike) -> NDArray:
    """Body-fixed unit vectors (…, 3) pointing at the given latitude/longitude."""
    lat_r, lon_r = np.radians(lat), np.radians(lon)
    return np.stack(
        [np.cos(lat_r) * np.cos(lon_r), np.cos(lat_r) * np.sin(lon_r), np.sin(lat_r)], axis=-1
    )


def enu_axes(lat: float, lon: float) -> tuple[NDArray, NDArray, NDArray]:
    """Local east, north and up unit vectors in body-fixed coordinates."""
    lat_r, lon_r = np.radians(lat), np.radians(lon)
    east = np.array([-np.sin(lon_r), np.cos(lon_r), 0.0])
    north = np.array(
        [-np.sin(lat_r) * np.cos(lon_r), -np.sin(lat_r) * np.sin(lon_r), np.cos(lat_r)]
    )
    up = unit_vectors(lat, lon)
    return east, north, up


def projected_axes(dem: PolarDEM, lat: float, lon: float) -> tuple[NDArray, NDArray, float]:
    """
    Local north and east as unit vectors in the DEM's projected plane, plus the projection's
    scale factor there (projected meters per meter on the ground).
    """
    eps = 1e-4
    x0, y0 = dem.projection.to_xy(lat, lon)
    xn, yn = dem.projection.to_xy(lat + eps, lon)
    xe, ye = dem.projection.to_xy(lat, lon + eps)
    north = np.array([xn - x0, yn - y0])
    east = np.array([xe - x0, ye - y0])
    scale = np.linalg.norm(north) / (dem.projection.radius_m * np.radians(eps))
    return north / np.linalg.norm(north), east / np.linalg.norm(east), float(scale)
