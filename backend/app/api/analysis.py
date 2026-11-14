from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.analysis import AnalyzeResponse, ScenarioRequest
from app.services.analysis import analyze
from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizon_mask import horizon_for_site
from app.services.horizons import HorizonsClient, HorizonsError

router = APIRouter(prefix="/api/analyze", tags=["analysis"])


@router.post("", response_model=AnalyzeResponse)
async def analyze_scenario(
    scenario: ScenarioRequest,
    client: Annotated[HorizonsClient, Depends(get_horizons_client)],
) -> AnalyzeResponse:
    """Sun and Earth visibility windows, metrics and a verdict for one site and time range."""
    try:
        eph = await get_ephemeris(
            client,
            scenario.lat,
            scenario.lon,
            scenario.alt_m,
            scenario.start,
            scenario.end,
            scenario.step_minutes,
        )
    except HorizonsError as exc:
        raise HTTPException(502, str(exc)) from exc

    horizon = horizon_for_site(scenario.lat, scenario.lon)
    return analyze(eph, horizon, scenario.min_earth_elevation_deg)
