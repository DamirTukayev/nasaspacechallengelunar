import pytest

from app.services.analysis import analyze, lunar_day_verdict
from app.services.horizon_mask import SphereHorizon
from tests.test_analysis import make_ephemeris

DAY = 24.0
MONTH = 29.5 * DAY


@pytest.mark.parametrize(
    ("both_hours", "expected"),
    [
        (12.7 * DAY, "green"),  # IM-1, Mons Malapert
        (10 * DAY, "green"),
        (8.6 * DAY, "yellow"),  # Mons Mouton in a poor month
        (5.8 * DAY, "yellow"),  # the south pole in a poor month
        (4 * DAY, "red"),
    ],
)
def test_lunar_day_thresholds(both_hours: float, expected: str) -> None:
    verdict, reasons = lunar_day_verdict(both_hours, 50, 100, False, MONTH)
    assert verdict == expected
    assert reasons[0].startswith("Sun and Earth together for up to")


def test_far_side_explains_the_missing_earth() -> None:
    verdict, reasons = lunar_day_verdict(0, 51, 0, False, MONTH)  # Chang'e 4
    assert verdict == "red"
    assert "relay satellite" in reasons[0]


def test_crater_floor_explains_the_missing_sun() -> None:
    verdict, reasons = lunar_day_verdict(0, 0, 100, False, MONTH)  # Shackleton floor
    assert verdict == "red"
    assert "No sunlight" in reasons[0]


def test_a_stretch_cut_by_the_dates_says_so() -> None:
    _, reasons = lunar_day_verdict(6 * DAY, 50, 100, True, MONTH)
    assert any("runs past the selected dates" in r for r in reasons)
    _, green = lunar_day_verdict(12 * DAY, 50, 100, True, MONTH)
    assert len(green) == 1  # a green verdict needs no caveat


@pytest.mark.parametrize(
    ("both_hours", "expected"),
    [
        (7 * DAY, "green"),  # the whole week has Sun and Earth
        (7 * DAY - 3, "green"),  # within sampling slack
        (4.1 * DAY, "yellow"),  # Mons Malapert, 14-21 Nov 2026: the Sun sets mid-week
        (2 * DAY, "red"),
    ],
)
def test_short_date_ranges_are_judged_against_the_range(both_hours: float, expected: str) -> None:
    # Ten days cannot fit into seven: the question becomes "does this week work?".
    verdict, reasons = lunar_day_verdict(both_hours, 50, 100, False, 7 * DAY)
    assert verdict == expected
    assert "selected 7.0 d" in reasons[0]


def test_analyze_returns_both_missions_and_keeps_the_old_verdict() -> None:
    # 15 days of Sun with Earth always up, then 14.5 days of night: an equatorial lunar day.
    hours = int(MONTH)
    sun = [5.0 if h < 15 * DAY else -5.0 for h in range(hours + 1)]
    result = analyze(make_ephemeris(sun, [5.0] * (hours + 1)), SphereHorizon())
    m = result.metrics

    assert m.longest_both_hours == pytest.approx(15 * DAY, abs=1)
    assert m.mission_verdicts["lunar_day"].verdict == "green"
    assert m.mission_verdicts["survive_night"].verdict == "red"  # a 14-day night
    # The original fields are the survive-the-night verdict, unchanged for old clients.
    assert m.verdict == m.mission_verdicts["survive_night"].verdict
    assert m.verdict_reasons == m.mission_verdicts["survive_night"].reasons
