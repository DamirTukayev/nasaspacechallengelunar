from pydantic import BaseModel, Field

from app.services.horizon_mask import HorizonKind


class TerrainResponse(BaseModel):
    kind: HorizonKind = Field(description="'terrain' inside the DEM, 'sphere' elsewhere")
    size: int = Field(description="Grid is size × size nodes")
    half_extent_m: float = Field(description="Grid spans ±half_extent_m east and north")
    heights: list[float] = Field(
        description=(
            "Row-major heights in meters above the site's ground plane; row 0 is the north "
            "edge, column 0 the west edge. Includes the Moon's curvature."
        )
    )
    site_alt_m: float | None = Field(description="Site height relative to 1737.4 km")
    dem: str | None
    lat: float | None = None
    lon: float | None = None
    source_resolution_m: float | None = None

    valid: list[bool] | None = Field(
        default=None,
        description=(
            "Row-major DEM coverage mask; false means sphere fallback, not measured terrain. "
            "Null for sphere-only responses."
        ),
    )
