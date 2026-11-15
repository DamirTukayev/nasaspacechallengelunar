from datetime import datetime

from pydantic import BaseModel, Field


class Source(BaseModel):
    name: str
    url: str


class Weights(BaseModel):
    terrain: float
    light: float
    comm: float
    resources: float


class Thresholds(BaseModel):
    max_slope_deg: float
    min_sunlit_pct: float


class SearchPoints(BaseModel):
    """Columnar: index i of every array is one grid point."""

    x_km: list[float] = Field(description="Polar stereographic x (toward 90°E), km")
    y_km: list[float] = Field(description="Polar stereographic y (toward 0°E), km")
    lat: list[float]
    lon: list[float]
    alt_m: list[float]
    slope_deg: list[float]
    sunlit_pct: list[float]
    longest_dark_h: list[float]
    earth_pct: list[float]
    hydrogen_ppm: list[float]
    cold_trap: list[bool] = Field(
        description="Legacy name: no sunlight during this period, not a permanent cold trap"
    )
    cold_trap_km: list[float] = Field(
        description="Distance to nearest point unlit during this period; not used in scoring"
    )
    score_terrain: list[float]
    score_light: list[float]
    score_comm: list[float]
    score_resources: list[float]
    total: list[float]
    eligible: list[bool]


class Terrain(BaseModel):
    """Square heightmap centered on the pole; row 0 is the +y (0°E) edge."""

    size: int
    half_size_km: float
    cell_m: float
    heights_m: list[int]


class SiteTerrain(Terrain):
    """Native-resolution heightmap centered on the chosen site."""

    center_x_km: float
    center_y_km: float


class LandingSearchResponse(BaseModel):
    period_start: datetime
    period_end: datetime
    step_minutes: int
    radius_km: float
    spacing_km: float
    weights: Weights
    thresholds: Thresholds
    points: SearchPoints
    best: int | None = Field(description="Chosen site index, or null when no site is eligible")
    ranking: list[int] = Field(description="Top eligible sites, best first")
    terrain: Terrain
    site_terrain: SiteTerrain | None
    sources: list[Source]
