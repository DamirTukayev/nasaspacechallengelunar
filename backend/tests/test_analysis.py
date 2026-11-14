import math
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.analysis import (
    SUN_ANGULAR_RADIUS_DEG,
    analyze,
    disk_fraction,
    find_windows,
    intersect,
    longest_gap_hours,
    verdict_for,
)
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import Ephemeris, get_horizons_client
from app.services.horizon_mask import SphereHorizon, get_dem, get_horizon_cache
from app.services.horizons import AzElSeries
from tests.fakes import FakeHorizons

T0 = datetime(2026, 12, 1, tzinfo=UTC)


def hourly(hours: int) -> list[datetime]:
    return [T0 + timedelta(hours=h) for h in range(hours + 1)]


def make_ephemeris(sun_el: list[float], earth_el: list[float]) -> Ephemeris:
    times = hourly(len(sun_el) - 1)
    azimuth = [0.0] * len(times)
    return Ephemeris(
        times=times,
        sun=AzElSeries(times, azimuth, sun_el),
        earth=AzElSeries(times, azimuth, earth_el),
    )


def at(hours: float) -> datetime:
    return T0 + timedelta(hours=hours)


# --- solar disk ---------------------------------------------------------------------------


def test_disk_fraction_edges_and_center() -> None:
    r = SUN_ANGULAR_RADIUS_DEG
    assert disk_fraction(0.0) == pytest.approx(0.5)
    assert disk_fraction(r) == pytest.approx(1.0)
    assert disk_fraction(5.0) == 1.0
    assert disk_fraction(-r) == pytest.approx(0.0)
    assert disk_fraction(-5.0) == 0.0


def test_disk_fraction_is_monotonic_and_symmetric() -> None:
    r = SUN_ANGULAR_RADIUS_DEG
    values = [disk_fraction(r * k / 10) for k in range(-10, 11)]
    assert values == sorted(values)
    assert disk_fraction(0.1) + disk_fraction(-0.1) == pytest.approx(1.0)


# --- windows ------------------------------------------------------------------------------


def test_windows_follow_sign_changes_with_interpolated_edges() -> None:
    times = hourly(48)
    margins = [math.sin(2 * math.pi * h / 24) for h in range(49)]

    windows = find_windows(times, margins)

    assert [(w.start, w.end) for w in windows] == [(at(0), at(12)), (at(24), at(36))]
    assert all(w.duration_hours == pytest.approx(12) for w in windows)


def test_crossing_is_interpolated_between_samples() -> None:
    windows = find_windows(hourly(2), [-1.0, 1.0, 3.0])

    assert windows[0].start == at(0.5)


def test_windows_open_at_range_edges_are_flagged() -> None:
    windows = find_windows(hourly(3), [1.0, 1.0, 1.0, 1.0])

    assert len(windows) == 1
    assert windows[0].starts_before_range and windows[0].ends_after_range


def test_no_windows_when_always_below() -> None:
    assert find_windows(hourly(3), [-1.0] * 4) == []


def test_intersect_windows() -> None:
    a = find_windows(hourly(10), [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1])
    b = find_windows(hourly(10), [-1, -1, -1, 1, 1, 1, 1, 1, 1, 1, 1])

    both = intersect(a, b)

    assert [(w.start, w.end) for w in both] == [(at(2.5), at(5.5))]
    assert not both[0].starts_before_range and not both[0].ends_after_range


def test_longest_gap_includes_range_edges() -> None:
    windows = find_windows(hourly(10), [-1, -1, -1, 1, 1, -1, -1, -1, -1, -1, -1])

    assert longest_gap_hours(windows, at(0), at(10)) == pytest.approx(5.5)
    assert longest_gap_hours([], at(0), at(10)) == pytest.approx(10)


# --- verdict ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("sunlit", "earth", "dark", "expected"),
    [
        (100, 100, 0, "green"),
        (80, 60, 10, "green"),
        (60, 100, 0, "yellow"),
        (100, 30, 0, "yellow"),
        (100, 100, 30, "yellow"),
        (30, 100, 0, "red"),
        (100, 10, 0, "red"),
        (90, 90, 200, "red"),
    ],
)
def test_verdict_thresholds(sunlit: float, earth: float, dark: float, expected: str) -> None:
    verdict, reasons = verdict_for(sunlit, earth, dark)

    assert verdict == expected
    assert reasons


# --- full analysis ------------------------------------------------------------------------


def test_analyze_always_visible_site_is_green() -> None:
    result = analyze(make_ephemeris([5.0] * 25, [3.0] * 25), SphereHorizon())

    m = result.metrics
    assert result.horizon_kind == "sphere"
    assert m.sunlit_pct == pytest.approx(100)
    assert m.both_pct == pytest.approx(100)
    assert m.next_sunset is None and m.next_earthset is None
    assert m.longest_dark_hours == 0
    assert m.verdict == "green"
    assert result.series.sun.visible_fraction == [1.0] * 25
    assert result.series.earth.visible == [True] * 25


def test_analyze_day_night_cycle() -> None:
    # 48 h, the Sun sets at 12 h and rises at 24 h; the Earth is always up.
    sun = [10 * math.sin(2 * math.pi * h / 24) for h in range(49)]
    result = analyze(make_ephemeris(sun, [5.0] * 49), SphereHorizon())

    m = result.metrics
    # The upper limb keeps the Sun "up" a little past the geometric crossing.
    assert 50 < m.sunlit_pct < 52
    assert m.next_sunset is not None and at(12) < m.next_sunset < at(12.2)
    assert m.next_sunrise is not None and at(23.8) < m.next_sunrise < at(24)
    assert m.earth_visible_pct == pytest.approx(100)
    assert m.mean_sun_el_sunlit is not None and m.mean_sun_el_sunlit > 0


def test_min_earth_elevation_hides_low_earth() -> None:
    eph = make_ephemeris([5.0] * 25, [1.0] * 25)

    assert analyze(eph, SphereHorizon(), 0.0).metrics.earth_visible_pct == pytest.approx(100)
    assert analyze(eph, SphereHorizon(), 2.0).metrics.earth_visible_pct == 0


def test_analyze_never_sunlit() -> None:
    m = analyze(make_ephemeris([-5.0] * 25, [5.0] * 25), SphereHorizon()).metrics

    assert m.sunlit_pct == 0
    assert m.mean_sun_el_sunlit is None
    assert m.longest_dark_hours == pytest.approx(24)
    assert m.verdict == "red"


# --- endpoint -----------------------------------------------------------------------------


@pytest.fixture
def api(tmp_path):
    fake = FakeHorizons()
    app.dependency_overrides[get_horizons_client] = lambda: fake.client()
    # No DEM: a smooth sphere, whatever is downloaded on this machine.
    app.dependency_overrides[get_dem] = lambda: None
    app.dependency_overrides[get_horizon_cache] = lambda: JsonDiskCache(tmp_path)
    yield TestClient(app), fake
    app.dependency_overrides.clear()


SCENARIO = {
    "lat": -85.98,
    "lon": -1.67,
    "start": "2026-12-01T00:00:00Z",
    "end": "2026-12-01T03:00:00Z",
    "step_minutes": 60,
}


def test_analyze_endpoint_on_recorded_malapert_data(api) -> None:
    client, _ = api
    response = client.post("/api/analyze", json=SCENARIO)

    assert response.status_code == 200
    body = response.json()
    assert body["horizon_kind"] == "sphere"
    assert len(body["series"]["times"]) == 4
    assert body["metrics"]["sunlit_pct"] == pytest.approx(100)
    assert body["metrics"]["verdict"] == "green"
    assert body["windows"]["both"][0]["starts_before_range"] is True


def test_analyze_endpoint_validates_interval(api) -> None:
    client, fake = api
    response = client.post("/api/analyze", json={**SCENARIO, "end": "2026-11-30T00:00:00Z"})

    assert response.status_code == 422
    assert fake.requests == []


def test_analyze_endpoint_maps_horizons_failure_to_502(api) -> None:
    client, fake = api
    fake.override = httpx.ConnectTimeout("timed out")

    assert client.post("/api/analyze", json=SCENARIO).status_code == 502


@pytest.mark.parametrize(
    ("hours", "text"),
    [
        (30.0, "Longest darkness 30 h (over the 24 h limit)"),
        (179.4, "Longest darkness 7.5 d (over the 100 h limit)"),
    ],
)
def test_darkness_reason_matches_the_metric_cards(hours: float, text: str) -> None:
    _, reasons = verdict_for(90.0, 90.0, hours)
    assert text in reasons
