from datetime import datetime, timedelta
from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.schemas.analysis import Mission, ScenarioRequest, Verdict
from app.services.horizon_mask import HorizonKind
from app.services.time_grid import MAX_POINTS, check_time_grid

DEFAULT_DAYS = 182
MAX_DAYS = 366
# A calendar answers "which day do we land?"; a mission of many months has no landing day to pick.
MAX_MISSION_DAYS = 60
# Every landing date re-runs the analysis over its own mission: dates × samples per mission.
# A year of dates with an hourly lunar-day mission is ~260 000 and takes ~0.1 s on a laptop.
MAX_SAMPLES = 600_000


class CalendarRequest(ScenarioRequest):
    """`start`–`end` is the mission for the first landing date; every later date shifts it by
    whole days, so the first entry of the calendar has the metrics /api/analyze returns."""

    days: int = Field(
        default=DEFAULT_DAYS, ge=2, le=MAX_DAYS, description="Landing dates to try, one per day"
    )

    @model_validator(mode="after")
    def check_grid(self) -> Self:
        # The calendar fetches a bracketing sample and interpolates even sub-step missions.
        self.start, self.end = check_time_grid(
            self.start, self.end, self.step_minutes, allow_substep=True
        )
        return self

    @model_validator(mode="after")
    def check_calendar(self) -> Self:
        if 1440 % self.step_minutes != 0:
            raise ValueError(
                "step_minutes must divide a day evenly (10, 30, 60, 180, 360…),"
                " so that every landing date falls on the time grid"
            )
        mission = self.end - self.start
        if mission > timedelta(days=MAX_MISSION_DAYS):
            raise ValueError(
                f"Mission of {mission.days} days is too long for a calendar"
                f" (max {MAX_MISSION_DAYS}); shorten the dates"
            )
        per_mission = -(-mission // timedelta(minutes=self.step_minutes)) + 1
        points = (self.days - 1) * (1440 // self.step_minutes) + per_mission
        if points > MAX_POINTS or self.days * per_mission > MAX_SAMPLES:
            raise ValueError(
                f"Too many time points for a calendar ({points} in all, {per_mission} per date);"
                " increase step_minutes or ask for fewer days"
            )
        return self


class CalendarDay(BaseModel):
    """One landing date: the mission that starts at `start` and runs to `end`."""

    start: datetime
    end: datetime
    sunlit_pct: float
    earth_visible_pct: float
    both_pct: float
    longest_dark_hours: float
    longest_no_earth_hours: float
    longest_both_hours: float
    both_from_start_hours: float = Field(
        description="Unbroken time with both Sun and Earth counted from the landing moment;"
        " 0 when either is missing at landing"
    )
    both_outlasts_mission: bool = Field(
        description="That stretch is still open when the mission ends"
    )
    sunlit_at_start: bool
    earth_at_start: bool
    verdicts: dict[Mission, Verdict] = Field(
        description="survive_night: as in /api/analyze for these dates. lunar_day: judged from"
        " touchdown, on both_from_start_hours, so landing in darkness is red"
    )


class CalendarResponse(BaseModel):
    horizon_kind: HorizonKind
    site_alt_m: float | None
    mission_hours: float = Field(description="Length of the mission analysed for every date")
    step_minutes: int
    days: list[CalendarDay] = Field(description="Consecutive landing dates, one day apart")
