from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.schemas.analysis import ScenarioRequest, Verdict

# Each node needs its own skyline (~40 ms with 4 threads), so the grid is kept modest.
MAX_GRID_SIDE = 21
# Every node re-runs the analysis over the whole time grid.
MAX_TIME_POINTS = 2000


class NearbyRequest(ScenarioRequest):
    half_extent_km: float = Field(
        default=5.0, ge=0.5, le=10, description="Grid reaches this far east/west/north/south"
    )
    step_km: float = Field(default=1.0, ge=0.25, le=5, description="Spacing between grid nodes")

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
