from datetime import datetime

from pydantic import BaseModel, Field


class AzElTrack(BaseModel):
    azimuth: list[float] = Field(description="Degrees, clockwise from north")
    elevation: list[float] = Field(description="Degrees above the sphere's local horizon")


class EphemerisResponse(BaseModel):
    """Columnar series: index i of every array refers to times[i]."""

    times: list[datetime]
    sun: AzElTrack
    earth: AzElTrack
    step_minutes: int
