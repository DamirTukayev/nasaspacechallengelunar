from pydantic import BaseModel, Field

from app.services.horizon_mask import HorizonKind


class HorizonHits(BaseModel):
    """Where each azimuth's ray meets the skyline. Same order as `azimuths`; null off the DEM."""

    distance_m: list[float | None] = Field(description="Ground distance from the site")
    height_m: list[float | None] = Field(description="Terrain height relative to 1737.4 km")
    lat: list[float | None]
    lon: list[float | None]


class HorizonResponse(BaseModel):
    kind: HorizonKind = Field(description="'terrain' inside the DEM, 'sphere' elsewhere")
    azimuths: list[float] = Field(description="Degrees from north, clockwise")
    elevations: list[float] = Field(description="Skyline elevation at each azimuth, degrees")
    site_alt_m: float | None = Field(description="Terrain height at the site relative to 1737.4 km")
    observer_height_m: float = Field(description="Eye/panel height above the ground")
    dem: str | None = Field(description="DEM product the skyline was computed from")
    hits: HorizonHits | None = Field(
        default=None, description="Skyline points, with include_hits=true and terrain only"
    )
    rays: int = Field(description="Number of azimuths (rays) the skyline was traced along")
    terrain_samples: int | None = Field(
        default=None, description="Terrain points evaluated for the skyline (terrain only)"
    )
