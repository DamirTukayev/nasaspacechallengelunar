from pydantic import BaseModel, Field

from app.services.horizon_mask import HorizonKind


class HorizonResponse(BaseModel):
    kind: HorizonKind = Field(description="'terrain' inside the DEM, 'sphere' elsewhere")
    azimuths: list[float] = Field(description="Degrees from north, clockwise")
    elevations: list[float] = Field(description="Skyline elevation at each azimuth, degrees")
    site_alt_m: float | None = Field(description="Terrain height at the site relative to 1737.4 km")
    observer_height_m: float = Field(description="Eye/panel height above the ground")
    dem: str | None = Field(description="DEM product the skyline was computed from")
