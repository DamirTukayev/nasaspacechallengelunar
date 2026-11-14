from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.ephemeris import AzElTrack, EphemerisResponse
from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizons import HorizonsClient, HorizonsError
from app.services.time_grid import check_time_grid

router = APIRouter(prefix="/api/ephemeris", tags=["ephemeris"])


@router.get("", response_model=EphemerisResponse)
async def read_ephemeris(
    client: Annotated[HorizonsClient, Depends(get_horizons_client)],
    lat: Annotated[float, Query(ge=-90, le=90, description="Latitude, degrees")],
    lon: Annotated[float, Query(ge=-180, le=180, description="East longitude, degrees")],
    start: Annotated[datetime, Query(description="UTC if no offset is given")],
    end: Annotated[datetime, Query(description="UTC if no offset is given")],
    alt_m: Annotated[float, Query(ge=-10_000, le=12_000)] = 0.0,
    step_minutes: Annotated[int, Query(ge=1, le=1440)] = 60,
) -> EphemerisResponse:
    """Sun and Earth azimuth/elevation seen from a point on the Moon (JPL Horizons)."""
    try:
        start, end = check_time_grid(start, end, step_minutes)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    try:
        eph = await get_ephemeris(client, lat, lon, alt_m, start, end, step_minutes)
    except HorizonsError as exc:
        raise HTTPException(502, str(exc)) from exc

    return EphemerisResponse(
        times=eph.times,
        sun=AzElTrack(azimuth=eph.sun.azimuth, elevation=eph.sun.elevation),
        earth=AzElTrack(azimuth=eph.earth.azimuth, elevation=eph.earth.elevation),
        step_minutes=step_minutes,
    )
