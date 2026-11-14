"""What a mission gets if it lands on each of many consecutive dates.

A slipped launch moves the landing date, and at the lunar poles two weeks can turn a viable
mission into an impossible one. The calendar slides the same mission (same site, same length)
along the dates, one day at a time, and summarises each one.

One ephemeris and one skyline cover the whole span. Each date is then a slice of the same
samples, summarised by the same code as a single scenario, so a calendar entry and
/api/analyze for those dates give the same numbers.

One thing is judged differently. /api/analyze asks "does this period hold a good stretch of
Sun and Earth?", wherever in the period it falls. A landing date has to answer "what does the
lander get from touchdown?": a day-only lander that arrives three days before sunrise never
wakes up, however good the fortnight that follows. So the day-only verdict of a landing date
counts the stretch of Sun and Earth that is already open at touchdown, against the same bars.
"""

from datetime import datetime, timedelta

from app.schemas.calendar import CalendarDay
from app.services.analysis import (
    SUN_ANGULAR_RADIUS_DEG,
    lunar_day_verdict,
    summarize,
    visibility,
)
from app.services.ephemeris import Ephemeris
from app.services.horizon_mask import HorizonMask


def calendar_stop(end: datetime, days: int) -> datetime:
    """The last moment the calendar needs: the end of the mission for the last landing date."""
    return end + timedelta(days=days - 1)


def landing_calendar(
    eph: Ephemeris,
    horizon: HorizonMask,
    mission: timedelta,
    days: int,
    step_minutes: int,
    min_earth_elevation_deg: float = 0.0,
) -> list[CalendarDay]:
    """One entry per landing date; `eph` starts at the first landing and covers every mission."""
    per_day = 1440 // step_minutes
    per_mission = mission // timedelta(minutes=step_minutes) + 1
    needed = (days - 1) * per_day + per_mission
    if len(eph.times) < needed:
        raise ValueError(f"Ephemeris has {len(eph.times)} samples, the calendar needs {needed}")

    vis = visibility(eph, horizon, min_earth_elevation_deg)

    result: list[CalendarDay] = []
    for day in range(days):
        a, b = day * per_day, day * per_day + per_mission
        windows, m = summarize(
            eph.times[a:b],
            eph.sun.elevation[a:b],
            vis.sun_margin[a:b],
            vis.sun_fraction[a:b],
            vis.earth_margin[a:b],
        )
        # Only a stretch that is already open at touchdown counts from the landing moment.
        first = windows.both[0] if windows.both else None
        from_start = first if first is not None and first.starts_before_range else None
        from_start_hours = from_start.duration_hours if from_start else 0.0
        day_only, _ = lunar_day_verdict(
            from_start_hours,
            m.sunlit_pct,
            m.earth_visible_pct,
            window_cut_by_range=bool(from_start and from_start.ends_after_range),
            total_hours=(eph.times[b - 1] - eph.times[a]).total_seconds() / 3600,
        )
        result.append(
            CalendarDay(
                start=eph.times[a],
                end=eph.times[a] + mission,
                sunlit_pct=round(m.sunlit_pct, 2),
                earth_visible_pct=round(m.earth_visible_pct, 2),
                both_pct=round(m.both_pct, 2),
                longest_dark_hours=round(m.longest_dark_hours, 2),
                longest_no_earth_hours=round(m.longest_no_earth_hours, 2),
                longest_both_hours=round(m.longest_both_hours, 2),
                both_from_start_hours=round(from_start_hours, 2),
                both_outlasts_mission=bool(from_start and from_start.ends_after_range),
                sunlit_at_start=vis.sun_margin[a] + SUN_ANGULAR_RADIUS_DEG > 0,
                earth_at_start=vis.earth_margin[a] > 0,
                verdicts={
                    "lunar_day": day_only,
                    "survive_night": m.mission_verdicts["survive_night"].verdict,
                },
            )
        )
    return result
