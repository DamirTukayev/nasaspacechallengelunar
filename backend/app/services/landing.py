"""Grid search for the best landing site around the lunar south pole.

Every grid point gets four 0..1 scores and a weighted total:

* terrain   — slope from the LOLA DEM (flat is good)
* light     — share of time the Sun is above the local skyline, and the longest night
* comm      — share of time the Earth is above the local skyline (direct-to-Earth link)
* resources — Lunar Prospector hydrogen (water-ice proxy) and distance to the nearest
              permanently shadowed grid point (cold trap)

Sun and Earth directions are fetched once (JPL Horizons, from a reference site) and turned
into Moon-fixed unit vectors. Across a ~200 km wide area the parallax of the Sun is nil and of
the Earth ~0.02°, so the same vectors serve every grid point; only the local up/north/east
axes and the terrain skyline change from point to point.
"""

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from app.services.analysis import SUN_ANGULAR_RADIUS_DEG, find_windows, longest_gap_hours
from app.services.ephemeris import Ephemeris
from app.terrain.dem import PolarDEM
from app.terrain.horizon import compute_horizon
from app.terrain.hydrogen import HydrogenMap

# Where the shared Sun/Earth ephemeris is taken from (close to the pole, but off it).
REFERENCE_SITE = (-88.0, 0.0)

# Skyline settings for the search: coarser than the single-site analysis, ~10x faster.
SEARCH_AZIMUTH_STEP_DEG = 2.0
SEARCH_HORIZON_DISTANCE_M = 100_000.0
SLOPE_BASELINE_M = 240.0

# Score shapes.
SLOPE_GOOD_DEG, SLOPE_BAD_DEG = 2.0, 15.0
LONG_NIGHT_HOURS = 240.0
COLD_TRAP_NEAR_KM = 25.0

# A site is only eligible when a lander can actually sit there and survive.
MAX_SLOPE_DEG = 10.0
MIN_SUNLIT_PCT = 30.0

DEFAULT_WEIGHTS = {"terrain": 0.25, "light": 0.3, "comm": 0.2, "resources": 0.25}


@dataclass(frozen=True)
class SearchGrid:
    x_m: NDArray
    y_m: NDArray
    lat: NDArray
    lon: NDArray


@dataclass
class SearchResult:
    grid: SearchGrid
    alt_m: NDArray
    slope_deg: NDArray
    sunlit_pct: NDArray
    longest_dark_h: NDArray
    earth_pct: NDArray
    hydrogen_ppm: NDArray
    cold_trap: NDArray  # bool: never sunlit during the period
    cold_trap_km: NDArray
    scores: dict[str, NDArray]
    total: NDArray
    eligible: NDArray
    best: int | None
    ranking: list[int]
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))


def make_grid(dem: PolarDEM, radius_km: float, spacing_km: float) -> SearchGrid:
    """Square grid in the polar stereographic plane, clipped to a disk around the pole."""
    radius_m, step_m = radius_km * 1000, spacing_km * 1000
    n = int(radius_m // step_m)
    axis = np.arange(-n, n + 1) * step_m
    xx, yy = np.meshgrid(axis, axis)
    inside = np.hypot(xx, yy) <= radius_m
    x, y = xx[inside], yy[inside]
    # The pole itself has no defined north; nudge it so local axes exist.
    at_pole = (x == 0) & (y == 0)
    y = np.where(at_pole, -step_m * 0.05, y)
    lat, lon = dem.projection.to_latlon(x, y)
    return SearchGrid(x_m=x, y_m=y, lat=lat, lon=lon)


def slope_deg(
    dem: PolarDEM, x: NDArray, y: NDArray, baseline_m: float = SLOPE_BASELINE_M
) -> NDArray:
    """Steepest slope from central differences over 2 x baseline."""
    d = baseline_m
    dzdx = (dem.sample_xy(x + d, y) - dem.sample_xy(x - d, y)) / (2 * d)
    dzdy = (dem.sample_xy(x, y + d) - dem.sample_xy(x, y - d)) / (2 * d)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy)))


def _enu(lat: float, lon: float) -> tuple[NDArray, NDArray, NDArray]:
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    return up, north, east


def azel_to_vectors(lat: float, lon: float, azimuth: NDArray, elevation: NDArray) -> NDArray:
    """Topocentric az/el (degrees, azimuth from north clockwise) → Moon-fixed unit vectors."""
    up, north, east = _enu(lat, lon)
    az, el = np.radians(azimuth), np.radians(elevation)
    horiz = np.cos(el)
    return (
        (horiz * np.cos(az))[:, None] * north
        + (horiz * np.sin(az))[:, None] * east
        + np.sin(el)[:, None] * up
    )


def vectors_to_azel(lat: float, lon: float, vectors: NDArray) -> tuple[NDArray, NDArray]:
    up, north, east = _enu(lat, lon)
    el = np.degrees(np.arcsin(np.clip(vectors @ up, -1, 1)))
    az = np.degrees(np.arctan2(vectors @ east, vectors @ north)) % 360
    return az, el


def longest_run(mask: NDArray) -> int:
    """Length of the longest run of True values."""
    if not mask.any():
        return 0
    padded = np.concatenate([[False], mask, [False]])
    edges = np.flatnonzero(np.diff(padded.astype(int)))
    return int((edges[1::2] - edges[0::2]).max())


def _ramp(value: NDArray, good: float, bad: float) -> NDArray:
    """1 at `good`, 0 at `bad`, linear in between (either direction)."""
    return np.clip((value - bad) / (good - bad), 0.0, 1.0)


def _normalize(values: NDArray) -> NDArray:
    lo, hi = np.nanmin(values), np.nanmax(values)
    if hi - lo < 1e-9:
        return np.zeros_like(values)
    return (values - lo) / (hi - lo)


def search(
    dem: PolarDEM,
    hydrogen: HydrogenMap,
    eph: Ephemeris,
    radius_km: float,
    spacing_km: float,
    weights: dict[str, float] | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> SearchResult:
    weights = {**DEFAULT_WEIGHTS, **(weights or {})}
    grid = make_grid(dem, radius_km, spacing_km)
    n = grid.lat.size

    alt = dem.sample_xy(grid.x_m, grid.y_m)
    slope = slope_deg(dem, grid.x_m, grid.y_m)

    ref_lat, ref_lon = REFERENCE_SITE
    sun_vec = azel_to_vectors(
        ref_lat, ref_lon, np.asarray(eph.sun.azimuth), np.asarray(eph.sun.elevation)
    )
    earth_vec = azel_to_vectors(
        ref_lat, ref_lon, np.asarray(eph.earth.azimuth), np.asarray(eph.earth.elevation)
    )
    if len(eph.times) < 2:
        raise ValueError("Landing search needs at least two ephemeris samples")
    total_h = (eph.times[-1] - eph.times[0]).total_seconds() / 3600

    sunlit_pct = np.zeros(n)
    dark_h = np.zeros(n)
    earth_pct = np.zeros(n)
    for i in range(n):
        lat, lon = float(grid.lat[i]), float(grid.lon[i])
        profile = compute_horizon(
            dem,
            lat,
            lon,
            azimuth_step_deg=SEARCH_AZIMUTH_STEP_DEG,
            max_distance_m=SEARCH_HORIZON_DISTANCE_M,
        )

        def skyline(az: NDArray, profile=profile) -> NDArray:
            return np.interp(az, profile.azimuths, profile.elevations, period=360)

        s_az, s_el = vectors_to_azel(lat, lon, sun_vec)
        sun_windows = find_windows(eph.times, s_el + SUN_ANGULAR_RADIUS_DEG - skyline(s_az))
        e_az, e_el = vectors_to_azel(lat, lon, earth_vec)
        earth_windows = find_windows(eph.times, e_el - skyline(e_az))

        sunlit_pct[i] = 100 * sum(w.duration_hours for w in sun_windows) / total_h
        dark_h[i] = longest_gap_hours(sun_windows, eph.times[0], eph.times[-1])
        earth_pct[i] = 100 * sum(w.duration_hours for w in earth_windows) / total_h
        if progress:
            progress(i + 1, n)

    h_ppm = hydrogen.sample(grid.lat, grid.lon)

    cold = sunlit_pct == 0
    if cold.any():
        cx, cy = grid.x_m[cold], grid.y_m[cold]
        d = np.hypot(grid.x_m[:, None] - cx[None, :], grid.y_m[:, None] - cy[None, :])
        cold_km = d.min(axis=1) / 1000
    else:
        cold_km = np.full(n, np.inf)

    scores = {
        "terrain": _ramp(slope, SLOPE_GOOD_DEG, SLOPE_BAD_DEG),
        "light": 0.75 * sunlit_pct / 100 + 0.25 * _ramp(dark_h, 0, LONG_NIGHT_HOURS),
        "comm": earth_pct / 100,
        "resources": 0.6 * _normalize(h_ppm)
        + 0.4 * np.where(cold, 0.0, _ramp(cold_km, 0, COLD_TRAP_NEAR_KM)),
    }
    weight_sum = sum(weights.values()) or 1.0
    total = sum(weights[k] * scores[k] for k in scores) / weight_sum
    total = np.nan_to_num(total, nan=0.0)

    eligible = (slope <= MAX_SLOPE_DEG) & (sunlit_pct >= MIN_SUNLIT_PCT) & ~cold & ~np.isnan(alt)
    ranked = np.argsort(-np.where(eligible, total, -1.0))
    ranking = [int(i) for i in ranked if eligible[i]][:5]
    best = ranking[0] if ranking else None

    return SearchResult(
        grid=grid,
        alt_m=alt,
        slope_deg=slope,
        sunlit_pct=sunlit_pct,
        longest_dark_h=dark_h,
        earth_pct=earth_pct,
        hydrogen_ppm=h_ppm,
        cold_trap=cold,
        cold_trap_km=cold_km,
        scores=scores,
        total=total,
        eligible=eligible,
        best=best,
        ranking=ranking,
        weights=weights,
    )


def terrain_heightmap(
    dem: PolarDEM,
    half_size_km: float,
    size: int,
    center_x_m: float = 0.0,
    center_y_m: float = 0.0,
) -> tuple[list[int], float]:
    """Square heightmap (meters, row 0 = +y edge) around a projected point, for the 3D view."""
    half = half_size_km * 1000
    axis = np.linspace(-half, half, size)
    xx, yy = np.meshgrid(center_x_m + axis, center_y_m + axis[::-1])
    heights = dem.sample_xy(xx.ravel(), yy.ravel())
    heights = np.nan_to_num(heights, nan=float(np.nanmin(heights)))
    return [int(round(h)) for h in heights], float(axis[1] - axis[0])
