"""The landing-date calendar: the same mission slid along the dates, one day at a time."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.calendar import get_calendar_cache
from app.main import app
from app.services.calendar import calendar_stop, landing_calendar
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import Ephemeris, get_horizons_client
from app.services.horizon_mask import SphereHorizon, get_dem, get_horizon_cache
from app.services.horizons import AzElSeries, HorizonsClient
from tests.fakes import FIXTURE_SITE, FakeHorizons, SyntheticHorizons, make_polar_dem

T0 = datetime(2026, 12, 1, tzinfo=UTC)
DAY = timedelta(days=1)


def make_ephemeris(sun_el: list[float], earth_el: list[float]) -> Ephemeris:
    times = [T0 + timedelta(hours=h) for h in range(len(sun_el))]
    azimuth = [0.0] * len(times)
    return Ephemeris(
        times=times,
        sun=AzElSeries(times, azimuth, sun_el),
        earth=AzElSeries(times, azimuth, earth_el),
    )


# --- service ------------------------------------------------------------------------------


def test_time_left_from_landing_shrinks_as_sunset_approaches() -> None:
    # Sun up for the first 10 days, then gone; Earth always in view. Three-day missions.
    hours = 15 * 24 + 1
    eph = make_ephemeris([1.0 if h < 240 else -1.0 for h in range(hours)], [5.0] * hours)

    days = landing_calendar(eph, SphereHorizon(), mission=3 * DAY, days=13, step_minutes=60)

    assert [d.start for d in days] == [T0 + i * DAY for i in range(13)]
    assert all(d.end - d.start == 3 * DAY for d in days)
    # Landing a week before sunset: the whole mission is lit, and the stretch outlasts it.
    assert days[0].both_from_start_hours == pytest.approx(72)
    assert days[0].both_outlasts_mission
    assert days[0].both_pct == pytest.approx(100)
    # Landing one day before sunset: a day of work, then darkness.
    assert days[9].both_from_start_hours == pytest.approx(24, abs=1)
    assert not days[9].both_outlasts_mission
    assert days[9].both_pct == pytest.approx(100 / 3, abs=1.5)
    # Landing after sunset: nothing.
    assert days[11].both_from_start_hours == 0
    assert not days[11].sunlit_at_start and days[11].earth_at_start
    assert days[11].sunlit_pct == 0


def test_a_stretch_that_opens_after_landing_does_not_count_from_landing() -> None:
    # Dark at touchdown, sunrise 12 hours later.
    hours = 4 * 24 + 1
    eph = make_ephemeris([-1.0 if h < 12 else 1.0 for h in range(hours)], [5.0] * hours)

    first, second = landing_calendar(eph, SphereHorizon(), mission=2 * DAY, days=2, step_minutes=60)

    assert first.both_from_start_hours == 0
    assert first.longest_both_hours == pytest.approx(36, abs=1)
    assert second.both_from_start_hours == pytest.approx(48)


def test_day_only_verdict_counts_from_touchdown() -> None:
    # Dark for the first three days, then twelve days of Sun; Earth always in view.
    hours = 30 * 24 + 1
    sun = [1.0 if 72 <= h < 360 else -1.0 for h in range(hours)]
    eph = make_ephemeris(sun, [5.0] * hours)

    days = landing_calendar(eph, SphereHorizon(), mission=14 * DAY, days=12, step_minutes=60)
    verdicts = [d.verdicts["lunar_day"] for d in days]

    # Landing before sunrise: the fortnight holds 11 days of Sun and Earth in a row (which the
    # single-scenario verdict would call viable), but the lander arrives in the dark.
    assert days[0].longest_both_hours > 240
    assert verdicts[:3] == ["red", "red", "red"]
    # Landing at sunrise or a day after leaves 10 days or more of work: viable.
    assert verdicts[3:5] == ["green", "green"]
    # Each day later leaves a day less: marginal down to 5 days, then not viable.
    assert verdicts[6:10] == ["yellow"] * 4
    assert verdicts[11] == "red"


def test_verdicts_follow_the_mission_kind() -> None:
    # Constant Sun and Earth: fine for both kinds of mission on every date.
    hours = 20 * 24 + 1
    eph = make_ephemeris([1.0] * hours, [5.0] * hours)

    days = landing_calendar(eph, SphereHorizon(), mission=14 * DAY, days=5, step_minutes=60)

    assert {tuple(sorted(d.verdicts.items())) for d in days} == {
        (("lunar_day", "green"), ("survive_night", "green"))
    }


def test_too_short_an_ephemeris_is_an_error() -> None:
    eph = make_ephemeris([1.0] * 48, [5.0] * 48)
    with pytest.raises(ValueError, match="needs"):
        landing_calendar(eph, SphereHorizon(), mission=2 * DAY, days=3, step_minutes=60)


def test_calendar_stop_is_the_end_of_the_last_mission() -> None:
    assert calendar_stop(T0 + 7 * DAY, days=30) == T0 + 36 * DAY


# --- endpoint -----------------------------------------------------------------------------

REQUEST = {
    "lat": FIXTURE_SITE["lat"],
    "lon": FIXTURE_SITE["lon"],
    "start": "2026-12-01T00:00:00Z",
    "end": "2026-12-08T00:00:00Z",
    "step_minutes": 60,
    "days": 100,
}


@pytest.fixture
def api(tmp_path):
    fake = SyntheticHorizons()
    state: dict = {"dem": None, "transport": fake}

    def client() -> HorizonsClient:
        return HorizonsClient(
            "https://horizons.test/api",
            cache=JsonDiskCache(tmp_path / "horizons"),
            transport=httpx.MockTransport(state["transport"]),
        )

    app.dependency_overrides[get_horizons_client] = client
    app.dependency_overrides[get_dem] = lambda: state["dem"]
    app.dependency_overrides[get_horizon_cache] = lambda: JsonDiskCache(tmp_path / "horizon")
    app.dependency_overrides[get_calendar_cache] = lambda: JsonDiskCache(tmp_path / "calendar")
    yield TestClient(app), fake, state
    app.dependency_overrides.clear()


def test_endpoint_returns_one_entry_per_landing_date(api) -> None:
    client, fake, _ = api

    response = client.post("/api/calendar", json=REQUEST)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["horizon_kind"] == "sphere"
    assert body["mission_hours"] == 168
    assert len(body["days"]) == 100
    assert body["days"][0]["start"] == "2026-12-01T00:00:00Z"
    assert body["days"][99]["start"] == "2027-03-10T00:00:00Z"
    assert body["days"][99]["end"] == "2027-03-17T00:00:00Z"
    # One ephemeris for all the dates: Sun and Earth, not 100 × 2.
    assert len(fake.requests) == 2


@pytest.mark.parametrize("shift", [0, 17, 40, 46, 95])
def test_every_date_matches_the_single_scenario_analysis(api, shift) -> None:
    client, _, _ = api
    start = T0 + shift * DAY
    scenario = {
        **{k: v for k, v in REQUEST.items() if k != "days"},
        "start": start.isoformat(),
        "end": (start + 7 * DAY).isoformat(),
    }

    day = client.post("/api/calendar", json=REQUEST).json()["days"][shift]
    metrics = client.post("/api/analyze", json=scenario).json()["metrics"]

    for field in (
        "sunlit_pct",
        "earth_visible_pct",
        "both_pct",
        "longest_dark_hours",
        "longest_no_earth_hours",
        "longest_both_hours",
    ):
        assert day[field] == pytest.approx(metrics[field], abs=0.006), field
    assert (
        day["verdicts"]["survive_night"] == metrics["mission_verdicts"]["survive_night"]["verdict"]
    )


def test_dates_differ_along_the_calendar(api) -> None:
    client, _, _ = api
    days = client.post("/api/calendar", json=REQUEST).json()["days"]

    # The synthetic Earth sets about 43 days in and the Sun about 49: early dates have both
    # for the whole week, dates after that have neither at touchdown.
    assert days[0]["both_from_start_hours"] == pytest.approx(168)
    assert days[0]["verdicts"]["lunar_day"] == "green"
    assert 0 < days[40]["both_from_start_hours"] < 168
    assert days[60]["both_from_start_hours"] == 0
    assert days[60]["verdicts"]["lunar_day"] == "red"
    assert not days[60]["sunlit_at_start"] and not days[60]["earth_at_start"]


def test_an_uneven_mission_length_follows_the_time_grid(api) -> None:
    # A lunar day is 29 d 12 h 44 min: on an hourly grid the last sample is at 29 d 12 h,
    # exactly as in /api/analyze.
    client, _, _ = api
    request = {**REQUEST, "end": "2026-12-30T12:44:00Z", "days": 3}

    body = client.post("/api/calendar", json=request).json()
    metrics = client.post(
        "/api/analyze", json={k: v for k, v in request.items() if k != "days"}
    ).json()["metrics"]

    assert body["days"][0]["end"] == "2026-12-30T12:44:00Z"
    assert body["days"][0]["both_pct"] == pytest.approx(metrics["both_pct"], abs=0.006)
    assert body["days"][0]["longest_dark_hours"] == pytest.approx(
        metrics["longest_dark_hours"], abs=0.006
    )


def test_repeat_request_comes_from_cache(api) -> None:
    client, fake, _ = api
    first = client.post("/api/calendar", json=REQUEST).json()
    second = client.post("/api/calendar", json=REQUEST).json()
    assert first == second
    assert len(fake.requests) == 2


def test_terrain_is_used_where_the_dem_covers_the_site(api) -> None:
    client, _, state = api
    state["dem"] = make_polar_dem(lambda lat, lon: lat * 0 + 1200.0)

    body = client.post("/api/calendar", json={**REQUEST, "days": 5}).json()

    assert body["horizon_kind"] == "terrain"
    assert body["site_alt_m"] == pytest.approx(1200)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"step_minutes": 7}, "divide a day evenly"),
        ({"end": "2027-03-01T00:00:00Z"}, "too long for a calendar"),
        ({"days": 366, "step_minutes": 10}, "Too many time points"),
        ({"days": 1}, "greater than or equal to 2"),
        ({"days": 400}, "less than or equal to 366"),
    ],
)
def test_bad_requests_are_rejected(api, change, message) -> None:
    client, _, _ = api
    response = client.post("/api/calendar", json={**REQUEST, **change})
    assert response.status_code == 422
    assert message in response.text


def test_a_year_of_dates_with_a_lunar_day_mission_is_accepted(api) -> None:
    client, _, _ = api
    request = {**REQUEST, "end": "2026-12-30T12:44:00Z", "days": 366}
    response = client.post("/api/calendar", json=request)
    assert response.status_code == 200, response.text
    assert len(response.json()["days"]) == 366


def test_horizons_failure_is_a_502(api) -> None:
    client, _, state = api
    state["transport"] = FakeHorizons(httpx.ConnectError("no network"))
    response = client.post("/api/calendar", json=REQUEST)
    assert response.status_code == 502
