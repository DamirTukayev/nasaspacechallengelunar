from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

SiteGroup = Literal["Apollo", "CLPS", "International", "South Pole"]


class Site(BaseModel):
    """A landing site. Coordinates are planetocentric, Mean Earth/Polar Axis, east-positive."""

    id: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    name: str = Field(min_length=1)
    group: SiteGroup
    lat: float = Field(ge=-90, le=90, description="Latitude, degrees")
    lon: float = Field(ge=-180, le=180, description="East longitude, degrees")
    alt_m: float | None = Field(
        default=None, description="Elevation relative to the 1737.4 km sphere, meters"
    )
    landing_date: date | None = Field(default=None, description="Touchdown date (UTC)")
    description: str
    source: HttpUrl = Field(description="Where the coordinates come from")
