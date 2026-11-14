"""Turns Sun/Earth ephemerides and a skyline into visibility windows, metrics and a verdict."""

import math
from collections.abc import Sequence
from datetime import datetime, timedelta

from app.schemas.analysis import (
    AnalyzeResponse,
    EarthTrack,
    Metrics,
    Series,
    SunTrack,
    Verdict,
    Window,
    Windows,
)
from app.services.ephemeris import Ephemeris
from app.services.horizon_mask import HorizonMask

# Mean apparent radius of the Sun seen from the Earth–Moon system.
SUN_ANGULAR_RADIUS_DEG = 0.2666

# Verdict thresholds. Red = mission-threatening, yellow = needs a closer look.
SUNLIT_RED_PCT, SUNLIT_YELLOW_PCT = 40.0, 75.0
EARTH_RED_PCT, EARTH_YELLOW_PCT = 20.0, 50.0
DARK_RED_HOURS, DARK_YELLOW_HOURS = 100.0, 24.0


def disk_fraction(margin_deg: float, radius_deg: float = SUN_ANGULAR_RADIUS_DEG) -> float:
    """Share of a disk above a straight skyline; margin = disk center elevation − skyline."""
    x = max(-1.0, min(1.0, margin_deg / radius_deg))
    # Area of the circular segment cut off by a chord at distance x·r from the center.
    return 1.0 - (math.acos(x) - x * math.sqrt(1.0 - x * x)) / math.pi


def _hours(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 3600


def _crossing(t0: datetime, m0: float, t1: datetime, m1: float) -> datetime:
    """Linear interpolation of the moment the margin crosses zero, rounded to a second."""
    t = t0 + (t1 - t0) * (m0 / (m0 - m1))
    return t.replace(microsecond=0) + timedelta(seconds=round(t.microsecond / 1e6))


def _window(start: datetime, end: datetime, open_start: bool, open_end: bool) -> Window:
    return Window(
        start=start,
        end=end,
        duration_hours=_hours(start, end),
        starts_before_range=open_start,
        ends_after_range=open_end,
    )


def find_windows(times: Sequence[datetime], margins: Sequence[float]) -> list[Window]:
    """Intervals where margin > 0, with edges interpolated between samples."""
    windows: list[Window] = []
    start: datetime | None = None
    open_start = False

    for i, (t, m) in enumerate(zip(times, margins, strict=True)):
        inside = m > 0
        if i == 0:
            if inside:
                start, open_start = t, True
            continue
        was_inside = margins[i - 1] > 0
        if inside and not was_inside:
            start, open_start = _crossing(times[i - 1], margins[i - 1], t, m), False
        elif was_inside and not inside and start is not None:
            end = _crossing(times[i - 1], margins[i - 1], t, m)
            windows.append(_window(start, end, open_start, False))
            start = None

    if start is not None:
        windows.append(_window(start, times[-1], open_start, True))
    return windows


def intersect(a: list[Window], b: list[Window]) -> list[Window]:
    result: list[Window] = []
    i = j = 0
    while i < len(a) and j < len(b):
        start, end = max(a[i].start, b[j].start), min(a[i].end, b[j].end)
        if start < end:
            open_start = a[i].start == start and a[i].starts_before_range
            open_start = open_start or (b[j].start == start and b[j].starts_before_range)
            open_end = (a[i].end == end and a[i].ends_after_range) or (
                b[j].end == end and b[j].ends_after_range
            )
            result.append(_window(start, end, open_start, open_end))
        if a[i].end < b[j].end:
            i += 1
        else:
            j += 1
    return result


def longest_gap_hours(windows: list[Window], t0: datetime, t1: datetime) -> float:
    edges = [t0]
    for w in windows:
        edges.extend([w.start, w.end])
    edges.append(t1)
    return max(_hours(edges[k], edges[k + 1]) for k in range(0, len(edges), 2))


def _pct(windows: list[Window], total_hours: float) -> float:
    return 100.0 * sum(w.duration_hours for w in windows) / total_hours


def _first(values: list[datetime | None]) -> datetime | None:
    return next((v for v in values if v is not None), None)


def format_hours(hours: float) -> str:
    """Same style as the metric cards: hours up to two days, then days."""
    return f"{hours:.0f} h" if hours < 48 else f"{hours / 24:.1f} d"


def verdict_for(
    sunlit_pct: float, earth_pct: float, longest_dark_hours: float
) -> tuple[Verdict, list[str]]:
    red: list[str] = []
    yellow: list[str] = []

    if sunlit_pct < SUNLIT_RED_PCT:
        red.append(f"Sunlit only {sunlit_pct:.0f}% of the time (< {SUNLIT_RED_PCT:.0f}%)")
    elif sunlit_pct < SUNLIT_YELLOW_PCT:
        yellow.append(f"Sunlit {sunlit_pct:.0f}% of the time (< {SUNLIT_YELLOW_PCT:.0f}%)")

    if earth_pct < EARTH_RED_PCT:
        red.append(f"Earth visible only {earth_pct:.0f}% of the time (< {EARTH_RED_PCT:.0f}%)")
    elif earth_pct < EARTH_YELLOW_PCT:
        yellow.append(f"Earth visible {earth_pct:.0f}% of the time (< {EARTH_YELLOW_PCT:.0f}%)")

    if longest_dark_hours > DARK_RED_HOURS:
        red.append(
            f"Longest darkness {format_hours(longest_dark_hours)}"
            f" (over the {DARK_RED_HOURS:.0f} h limit)"
        )
    elif longest_dark_hours > DARK_YELLOW_HOURS:
        yellow.append(
            f"Longest darkness {format_hours(longest_dark_hours)}"
            f" (over the {DARK_YELLOW_HOURS:.0f} h limit)"
        )

    if red:
        return "red", red + yellow
    if yellow:
        return "yellow", yellow
    return "green", ["Sun and Earth are visible most of the time"]


def analyze(
    eph: Ephemeris, horizon: HorizonMask, min_earth_elevation_deg: float = 0.0
) -> AnalyzeResponse:
    times = eph.times
    t0, t1 = times[0], times[-1]
    total_hours = max(_hours(t0, t1), 1e-9)

    sun_skyline = horizon.elevations_at(eph.sun.azimuth)
    earth_skyline = horizon.elevations_at(eph.earth.azimuth)

    sun_margin = [el - sky for el, sky in zip(eph.sun.elevation, sun_skyline, strict=True)]
    sun_fraction = [disk_fraction(m) for m in sun_margin]
    # Sunlit while the upper limb is above the skyline.
    sun_windows = find_windows(times, [m + SUN_ANGULAR_RADIUS_DEG for m in sun_margin])

    earth_margin = [
        el - sky - min_earth_elevation_deg
        for el, sky in zip(eph.earth.elevation, earth_skyline, strict=True)
    ]
    earth_visible = [m > 0 for m in earth_margin]
    earth_windows = find_windows(times, earth_margin)

    both_windows = intersect(sun_windows, earth_windows)

    sunlit_el = [el for el, f in zip(eph.sun.elevation, sun_fraction, strict=True) if f > 0]
    sunlit_pct = _pct(sun_windows, total_hours)
    earth_pct = _pct(earth_windows, total_hours)
    longest_dark = longest_gap_hours(sun_windows, t0, t1)
    verdict, reasons = verdict_for(sunlit_pct, earth_pct, longest_dark)

    metrics = Metrics(
        sunlit_pct=sunlit_pct,
        earth_visible_pct=earth_pct,
        both_pct=_pct(both_windows, total_hours),
        mean_sun_disk_fraction=sum(sun_fraction) / len(sun_fraction),
        max_sun_el=max(eph.sun.elevation),
        mean_sun_el_sunlit=sum(sunlit_el) / len(sunlit_el) if sunlit_el else None,
        next_sunrise=_first([w.start if not w.starts_before_range else None for w in sun_windows]),
        next_sunset=_first([w.end if not w.ends_after_range else None for w in sun_windows]),
        next_earthrise=_first(
            [w.start if not w.starts_before_range else None for w in earth_windows]
        ),
        next_earthset=_first([w.end if not w.ends_after_range else None for w in earth_windows]),
        longest_dark_hours=longest_dark,
        longest_no_earth_hours=longest_gap_hours(earth_windows, t0, t1),
        verdict=verdict,
        verdict_reasons=reasons,
    )

    return AnalyzeResponse(
        horizon_kind=horizon.kind,
        series=Series(
            times=times,
            sun=SunTrack(
                azimuth=eph.sun.azimuth,
                elevation=eph.sun.elevation,
                skyline=sun_skyline,
                visible_fraction=sun_fraction,
            ),
            earth=EarthTrack(
                azimuth=eph.earth.azimuth,
                elevation=eph.earth.elevation,
                skyline=earth_skyline,
                visible=earth_visible,
            ),
        ),
        windows=Windows(sun=sun_windows, earth=earth_windows, both=both_windows),
        metrics=metrics,
    )
