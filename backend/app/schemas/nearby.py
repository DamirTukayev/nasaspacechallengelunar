from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.schemas.analysis import ScenarioRequest, Verdict

# Each node needs its own skyline (~40 ms with 4 threads), so the grid is kept modest.
MAX_GRID_SIDE = 21
# Every node re-runs the analysis over the whole time grid.
MAX_TIME_POINTS = 2000
# The map the frontend asks for: 11 × 11 nodes.
DEFAULT_HALF_EXTENT_KM = 5.0
DEFAULT_STEP_KM = 1.0
# The sunlight map on the 3D terrain (W6): the whole ±20 km patch, 21 × 21 nodes.
SUNLIGHT_MAP_HALF_EXTENT_KM = 20.0
SUNLIGHT_MAP_STEP_KM = 2.0


class NearbyRequest(ScenarioRequest):
    half_extent_km: float = Field(
        default=DEFAULT_HALF_EXTENT_KM,
        ge=0.5,
        le=20,
        description="Grid reaches this far east/west/north/south",
    )
    step_km: float = Field(
        default=DEFAULT_STEP_KM, ge=0.25, le=5, description="Spacing between grid nodes"
    )
    include_timelines: bool = Field(
        default=False,
        description="Also return, per node, when the Sun and the Earth are visible (bit strings)",
    )

    @model_validator(mode="after")
    def check_size(self) -> Self:
        side = 2 * round(self.half_extent_km / self.step_km) + 1
        if side > MAX_GRID_SIDE:
            raise ValueError(
                f"Grid of {side}×{side} nodes is too large (max {MAX_GRID_SIDE}×{MAX_GRID_SIDE});"
                " increase step_km or reduce half_extent_km"
            )
        points = (self.end - self.start).total_seconds() / 60 / self.step_minutes + 1
        if points > MAX_TIME_POINTS:
            raise ValueError(
                f"Too many time points for a map ({int(points)}, max {MAX_TIME_POINTS});"
                " increase step_minutes or shorten the range"
            )
        return self


class NearbySpot(BaseModel):
    lat: float
    lon: float
    site_alt_m: float = Field(description="Terrain height relative to the 1737.4 km sphere")
    sunlit_pct: float
    earth_visible_pct: float
    both_pct: float
    longest_dark_hours: float
    longest_no_earth_hours: float
    verdict: Verdict


class NearbyTimelines(BaseModel):
    """Per node, one bit per time sample: 1 where the body is visible from that node.

    Each entry is base64 of the bits packed big-endian (numpy.packbits), `samples` bits long;
    None where the node is off the DEM. Same samples as /api/analyze for the same request.
    """

    samples: int
    sun: list[str | None]
    earth: list[str | None]


class NearbyResponse(BaseModel):
    """Row-major grid: spots[row * len(east_m) + col]; row 0 is the north edge."""

    center_lat: float
    center_lon: float
    east_m: list[float] = Field(description="Column offsets from the centre, west → east")
    north_m: list[float] = Field(description="Row offsets from the centre, north → south")
    spots: list[NearbySpot | None] = Field(description="None where the node is off the DEM")
    best_index: int | None = Field(description="Most time with both Sun and Earth")
    dem: str
    azimuth_step_deg: float = Field(description="Skyline resolution used for the grid")
    timelines: NearbyTimelines | None = Field(
        default=None, description="Only with include_timelines=true"
    )
