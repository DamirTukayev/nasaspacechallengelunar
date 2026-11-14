from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

from app.services.horizon_mask import HorizonKind
from app.services.time_grid import check_time_grid

Verdict = Literal["green", "yellow", "red"]


class ScenarioRequest(BaseModel):
    lat: float = Field(ge=-90, le=90, description="Latitude, degrees")
    lon: float = Field(ge=-180, le=180, description="East longitude, degrees")
    alt_m: float | None = Field(
        default=None,
        ge=-10_000,
        le=12_000,
        description="Height relative to the 1737.4 km sphere; taken from the DEM when omitted",
    )
    observer_height_m: float = Field(
        default=2.0, ge=0, le=100, description="Eye/panel height above the ground"
    )
    start: datetime = Field(description="UTC if no offset is given")
    end: datetime = Field(description="UTC if no offset is given")
    step_minutes: int = Field(default=60, ge=1, le=1440)
    min_earth_elevation_deg: float = Field(
        default=0.0,
        ge=-5,
        le=30,
        description="Earth counts as visible when its center is this far above the skyline",
    )

    @model_validator(mode="after")
    def check_grid(self) -> Self:
        self.start, self.end = check_time_grid(self.start, self.end, self.step_minutes)
        return self


class SunTrack(BaseModel):
    azimuth: list[float]
    elevation: list[float]
    skyline: list[float] = Field(description="Skyline elevation at the Sun's azimuth")
    visible_fraction: list[float] = Field(description="Share of the solar disk above the skyline")


class EarthTrack(BaseModel):
    azimuth: list[float]
    elevation: list[float]
    skyline: list[float] = Field(description="Skyline elevation at the Earth's azimuth")
    visible: list[bool]


class Series(BaseModel):
    """Columnar: index i of every array refers to times[i]."""

    times: list[datetime]
    sun: SunTrack
    earth: EarthTrack


class Window(BaseModel):
    start: datetime
    end: datetime
    duration_hours: float
    starts_before_range: bool = Field(description="Already open at the start of the range")
    ends_after_range: bool = Field(description="Still open at the end of the range")


class Windows(BaseModel):
    sun: list[Window]
    earth: list[Window]
    both: list[Window]


class Metrics(BaseModel):
    sunlit_pct: float = Field(description="Share of time with any part of the Sun visible")
    earth_visible_pct: float
    both_pct: float
    mean_sun_disk_fraction: float = Field(description="Average visible share of the solar disk")
    max_sun_el: float
    mean_sun_el_sunlit: float | None = Field(description="Mean Sun elevation while sunlit")
    next_sunrise: datetime | None
    next_sunset: datetime | None
    next_earthrise: datetime | None
    next_earthset: datetime | None
    longest_dark_hours: float
    longest_no_earth_hours: float
    verdict: Verdict
    verdict_reasons: list[str]


class AnalyzeResponse(BaseModel):
    horizon_kind: HorizonKind = Field(description="'terrain' inside the DEM, 'sphere' elsewhere")
    site_alt_m: float | None = Field(
        default=None, description="Terrain height at the site from the DEM, if available"
    )
    series: Series
    windows: Windows
    metrics: Metrics
