"""Glue between the landing search and its HTTP / static-file outputs."""

import logging
import math
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.config import get_settings
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import Ephemeris
from app.services.landing import (
    MAX_SLOPE_DEG,
    MIN_SUNLIT_PCT,
    SearchResult,
    terrain_heightmap,
)
from app.services.time_grid import check_time_grid
from app.terrain.dem import PDS_POLAR_URL, PolarDEM
from app.terrain.hydrogen import HYDROGEN_FILE, HYDROGEN_URL, HydrogenMap

log = logging.getLogger(__name__)

TERRAIN_SIZE = 192
TERRAIN_MARGIN_KM = 10.0
SITE_TERRAIN_SIZE = 97  # odd, so the chosen site sits exactly on the center sample

SOURCES = [
    {"name": "LRO LOLA south polar DEM (PDS Geosciences Node)", "url": PDS_POLAR_URL},
    {
        "name": "Lunar Prospector NS hydrogen map, Feldman et al. 2001 (PDS)",
        "url": HYDROGEN_URL,
    },
    {"name": "JPL Horizons ephemerides (Sun, Earth)", "url": "https://ssd.jpl.nasa.gov/horizons/"},
]


@dataclass(frozen=True)
class LandingParams:
    radius_km: float
    spacing_km: float
    start: datetime
    end: datetime
    step_minutes: int
    dem_name: str

    def __post_init__(self) -> None:
        start, end = check_time_grid(self.start, self.end, self.step_minutes)
        object.__setattr__(self, "start", start)
        object.__setattr__(self, "end", end)

    def cache_parts(self) -> dict[str, Any]:
        return {
            "v": 4,
            "radius_km": self.radius_km,
            "spacing_km": self.spacing_km,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "step_minutes": self.step_minutes,
            "dem": self.dem_name,
        }


_open_hydrogen: dict[Path, HydrogenMap] = {}
_missing_warned: set[Path] = set()


def get_hydrogen() -> HydrogenMap | None:
    """The hydrogen map, opened once. A missing map is checked again on every call, so
    `fetch_resources` run while the server is up takes effect without a restart."""
    path = get_settings().resources_dir / HYDROGEN_FILE

    hydrogen = _open_hydrogen.get(path)
    if hydrogen is not None:
        return hydrogen
    if not path.exists():
        if path not in _missing_warned:
            log.warning("No hydrogen map at %s", path)
            _missing_warned.add(path)
        return None

    hydrogen = HydrogenMap.open(path)
    _open_hydrogen[path] = hydrogen
    _missing_warned.discard(path)
    log.info("Opened hydrogen map %s", path)
    return hydrogen


def get_landing_cache() -> JsonDiskCache:
    return JsonDiskCache(get_settings().cache_dir / "landing")


def _r(values: np.ndarray, digits: int) -> list[float]:
    return [
        round(float(v), digits) if math.isfinite(float(v)) else 9999.0 for v in np.asarray(values)
    ]


def build_response(
    result: SearchResult, dem: PolarDEM, eph: Ephemeris, params: LandingParams
) -> dict[str, Any]:
    g = result.grid
    half = params.radius_km + TERRAIN_MARGIN_KM
    heights, cell_m = terrain_heightmap(dem, half, TERRAIN_SIZE)

    # Native-resolution close-up of the chosen site for the landing scene.
    site_terrain = None
    if result.best is not None:
        bx, by = float(g.x_m[result.best]), float(g.y_m[result.best])
        site_half_km = (SITE_TERRAIN_SIZE - 1) / 2 * dem.projection.map_scale_m / 1000
        site_heights, site_cell_m = terrain_heightmap(
            dem, site_half_km, SITE_TERRAIN_SIZE, center_x_m=bx, center_y_m=by
        )
        site_terrain = {
            "size": SITE_TERRAIN_SIZE,
            "half_size_km": round(site_half_km, 3),
            "cell_m": round(site_cell_m, 2),
            "center_x_km": round(bx / 1000, 3),
            "center_y_km": round(by / 1000, 3),
            "heights_m": site_heights,
        }
    return {
        "period_start": eph.times[0].isoformat(),
        "period_end": eph.times[-1].isoformat(),
        "step_minutes": params.step_minutes,
        "radius_km": params.radius_km,
        "spacing_km": params.spacing_km,
        "weights": result.weights,
        "thresholds": {"max_slope_deg": MAX_SLOPE_DEG, "min_sunlit_pct": MIN_SUNLIT_PCT},
        "points": {
            "x_km": _r(g.x_m / 1000, 2),
            "y_km": _r(g.y_m / 1000, 2),
            "lat": _r(g.lat, 4),
            "lon": _r(g.lon, 4),
            "alt_m": _r(result.alt_m, 0),
            "slope_deg": _r(result.slope_deg, 2),
            "sunlit_pct": _r(result.sunlit_pct, 1),
            "longest_dark_h": _r(result.longest_dark_h, 0),
            "earth_pct": _r(result.earth_pct, 1),
            "hydrogen_ppm": _r(result.hydrogen_ppm, 1),
            "cold_trap": [bool(v) for v in result.cold_trap],
            "cold_trap_km": _r(result.cold_trap_km, 1),
            "score_terrain": _r(result.scores["terrain"], 3),
            "score_light": _r(result.scores["light"], 3),
            "score_comm": _r(result.scores["comm"], 3),
            "score_resources": _r(result.scores["resources"], 3),
            "total": _r(result.total, 3),
            "eligible": [bool(v) for v in result.eligible],
        },
        "best": result.best,
        "ranking": result.ranking,
        "terrain": {
            "size": TERRAIN_SIZE,
            "half_size_km": half,
            "cell_m": round(cell_m, 2),
            "heights_m": heights,
        },
        "site_terrain": site_terrain,
        "sources": SOURCES,
    }
