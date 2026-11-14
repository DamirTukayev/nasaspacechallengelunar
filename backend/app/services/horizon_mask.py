import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal, Protocol

import numpy as np

from app.config import get_settings
from app.services.disk_cache import JsonDiskCache
from app.terrain.dem import PolarDEM
from app.terrain.horizon import AZIMUTH_STEP_DEG, MAX_DISTANCE_M, compute_horizon

log = logging.getLogger(__name__)

HorizonKind = Literal["sphere", "terrain"]


class HorizonMask(Protocol):
    """Elevation of the local skyline (degrees) as a function of azimuth (degrees from north)."""

    kind: HorizonKind

    def elevation(self, azimuth_deg: float) -> float: ...


class SphereHorizon:
    """Smooth sphere, no terrain: the skyline is at 0° in every direction."""

    kind: HorizonKind = "sphere"

    def elevation(self, azimuth_deg: float) -> float:
        return 0.0


class TerrainHorizon:
    """Skyline sampled at regular azimuths, linearly interpolated (wrapping at 360°)."""

    kind: HorizonKind = "terrain"

    def __init__(self, azimuths: list[float], elevations: list[float]) -> None:
        self.azimuths = np.asarray(azimuths, dtype=float)
        self.elevations = np.asarray(elevations, dtype=float)

    def elevation(self, azimuth_deg: float) -> float:
        return float(np.interp(azimuth_deg % 360, self.azimuths, self.elevations, period=360))


@dataclass(frozen=True)
class SiteHorizon:
    mask: HorizonMask
    azimuths: list[float]
    elevations: list[float]
    site_alt_m: float | None  # None when there is no DEM for the site
    observer_height_m: float
    dem_name: str | None


@lru_cache
def get_dem() -> PolarDEM | None:
    settings = get_settings()
    img = settings.dem_dir / f"{settings.dem_name}.img"
    lbl = settings.dem_dir / f"{settings.dem_name}.lbl"
    if not (img.exists() and lbl.exists()):
        log.warning("No DEM at %s; horizons fall back to a smooth sphere", img)
        return None
    return PolarDEM.open(img, lbl)


def get_horizon_cache() -> JsonDiskCache:
    return JsonDiskCache(get_settings().cache_dir / "horizon")


def _sphere(observer_height_m: float) -> SiteHorizon:
    azimuths = np.arange(0.0, 360.0, AZIMUTH_STEP_DEG).tolist()
    return SiteHorizon(
        mask=SphereHorizon(),
        azimuths=azimuths,
        elevations=[0.0] * len(azimuths),
        site_alt_m=None,
        observer_height_m=observer_height_m,
        dem_name=None,
    )


def horizon_for_site(
    lat: float,
    lon: float,
    observer_height_m: float,
    dem: PolarDEM | None,
    cache: JsonDiskCache,
) -> SiteHorizon:
    """Terrain skyline where the DEM covers the site, a flat 0° skyline elsewhere."""
    if dem is None or not dem.covers(lat):
        return _sphere(observer_height_m)

    key = JsonDiskCache.make_key(
        {
            "dem": dem.name,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "observer_height_m": observer_height_m,
            "step": AZIMUTH_STEP_DEG,
            "max_distance_m": MAX_DISTANCE_M,
        }
    )
    cached = cache.get(key)
    if cached is None:
        profile = compute_horizon(dem, lat, lon, observer_height_m)
        cached = {
            "azimuths": profile.azimuths.round(3).tolist(),
            "elevations": profile.elevations.round(4).tolist(),
            "site_alt_m": round(profile.site_alt_m, 1),
        }
        cache.set(key, cached)

    return SiteHorizon(
        mask=TerrainHorizon(cached["azimuths"], cached["elevations"]),
        azimuths=cached["azimuths"],
        elevations=cached["elevations"],
        site_alt_m=cached["site_alt_m"],
        observer_height_m=observer_height_m,
        dem_name=dem.name,
    )
