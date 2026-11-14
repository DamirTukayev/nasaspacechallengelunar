import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api.nearby import get_nearby_cache
from app.main import app
from app.schemas.analysis import Metrics
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_horizons_client
from app.services.horizon_mask import get_dem, get_horizon_cache
from app.services.horizons import AzElSeries
from app.services.nearby import Spot, _directions, best_spot, grid_around, local_az_el
from app.terrain.geometry import unit_vectors
from tests.fakes import FIXTURE_SITE, FIXTURE_START, FakeHorizons, make_polar_dem

R = 1_737_400.0
SITE = (FIXTURE_SITE["lat"], FIXTURE_SITE["lon"])  # Mons Malapert, inside the synthetic DEM


def flat(lat, lon):
    return np.zeros_like(lat)


def ground_distance_m(lat1, lon1, lat2, lon2) -> float:
    a, b = unit_vectors(lat1, lon1), unit_vectors(lat2, lon2)
    return float(R * np.arccos(np.clip(np.dot(a, b), -1, 1)))


# --- geometry -----------------------------------------------------------------------------


def test_grid_is_centred_and_evenly_spaced() -> None:
    dem = make_polar_dem(flat)
    grid = grid_around(dem, *SITE, half_extent_m=3000, step_m=1000)

    assert grid.lats.shape == (7, 7)
    assert grid.lats[3, 3] == pytest.approx(SITE[0], abs=1e-9)
    assert grid.lons[3, 3] == pytest.approx(SITE[1], abs=1e-9)
    # Neighbours are one step apart on the ground, both along rows and columns.
    assert ground_distance_m(
        grid.lats[3, 3], grid.lons[3, 3], grid.lats[3, 4], grid.lons[3, 4]
    ) == (pytest.approx(1000, rel=1e-3))
    assert ground_distance_m(
        grid.lats[3, 3], grid.lons[3, 3], grid.lats[2, 3], grid.lons[2, 3]
    ) == (pytest.approx(1000, rel=1e-3))


def test_grid_rows_run_north_to_south() -> None:
    dem = make_polar_dem(flat)
    grid = grid_around(dem, *SITE, half_extent_m=2000, step_m=1000)
    # In the southern hemisphere "north" means toward the equator: higher latitude.
    assert grid.lats[0, 2] > grid.lats[2, 2] > grid.lats[4, 2]
    assert list(grid.north_m) == [2000, 1000, 0, -1000, -2000]


def test_grid_at_the_pole_is_well_formed() -> None:
    grid = grid_around(make_polar_dem(flat), -90.0, 0.0, half_extent_m=2000, step_m=1000)
    assert np.isfinite(grid.lats).all() and np.isfinite(grid.lons).all()


def test_directions_round_trip_at_the_same_site() -> None:
    times = [FIXTURE_START] * 3
    series = AzElSeries(times, azimuth=[10.0, 200.0, 359.0], elevation=[1.5, -0.4, 30.0])

    az, el = local_az_el(_directions(series, *SITE), *SITE)

    assert az == pytest.approx(series.azimuth, abs=1e-9)
    assert el == pytest.approx(series.elevation, abs=1e-9)


def test_moving_toward_the_sun_raises_it() -> None:
    # Sun due north at the horizon; 30 km north (toward it) the local plane tips toward the Sun.
    series = AzElSeries([FIXTURE_START], azimuth=[0.0], elevation=[0.0])
    dirs = _directions(series, *SITE)
    grid = grid_around(make_polar_dem(flat), *SITE, half_extent_m=30_000, step_m=30_000)

    _, el_north = local_az_el(dirs, grid.lats[0, 1], grid.lons[0, 1])
    _, el_south = local_az_el(dirs, grid.lats[2, 1], grid.lons[2, 1])

    expected = np.degrees(30_000 / R)  # ≈ 0.99°
    assert el_north[0] == pytest.approx(expected, rel=1e-2)
    assert el_south[0] == pytest.approx(-expected, rel=1e-2)


def _spot(both: float, sunlit: float, dark: float) -> Spot:
    metrics = Metrics(
        sunlit_pct=sunlit,
        earth_visible_pct=100,
        both_pct=both,
        mean_sun_disk_fraction=0,
        max_sun_el=0,
        mean_sun_el_sunlit=None,
        next_sunrise=None,
        next_sunset=None,
        next_earthrise=None,
        next_earthset=None,
        longest_dark_hours=dark,
        longest_no_earth_hours=0,
        verdict="red",
        verdict_reasons=[],
    )
    return Spot(lat=0, lon=0, site_alt_m=0, metrics=metrics)


def test_best_spot_prefers_both_then_sun_then_short_night() -> None:
    assert best_spot([_spot(40, 50, 10), None, _spot(60, 60, 10)]) == 2
    assert best_spot([_spot(60, 60, 10), _spot(60, 70, 10)]) == 1
    assert best_spot([_spot(60, 60, 20), _spot(60, 60, 10)]) == 1
    assert best_spot([None, None]) is None


# --- endpoint -----------------------------------------------------------------------------


def crater(lat, lon):
    """A 3 km deep bowl, 6 km across, around the site: its floor sees a much higher skyline."""
    centre = unit_vectors(*SITE)
    d = R * np.arccos(np.clip(unit_vectors(lat, lon) @ centre, -1, 1))
    return np.where(d < 3000, -3000 * (1 - (d / 3000) ** 2), 0.0)


@pytest.fixture
def api(tmp_path):
    fake = FakeHorizons()
    state = {"dem": make_polar_dem(flat)}  # 300 km across: reaches −85°
    app.dependency_overrides[get_horizons_client] = lambda: fake.client()
    app.dependency_overrides[get_dem] = lambda: state["dem"]
    app.dependency_overrides[get_horizon_cache] = lambda: JsonDiskCache(tmp_path / "horizon")
    app.dependency_overrides[get_nearby_cache] = lambda: JsonDiskCache(tmp_path / "nearby")
    yield TestClient(app), fake, state
    app.dependency_overrides.clear()


REQUEST = {
    "lat": SITE[0],
    "lon": SITE[1],
    "start": "2026-12-01T00:00:00Z",
    "end": "2026-12-01T03:00:00Z",
    "step_minutes": 60,
    "half_extent_km": 2,
    "step_km": 1,
}


def test_endpoint_returns_a_grid_and_one_horizons_call_per_body(api) -> None:
    client, fake, _ = api

    response = client.post("/api/nearby", json=REQUEST)

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["east_m"]) == len(body["north_m"]) == 5
    assert len(body["spots"]) == 25
    assert body["best_index"] is not None
    assert body["azimuth_step_deg"] == 1.0
    # One ephemeris for the whole grid: Sun and Earth, not 25 × 2.
    assert len(fake.requests) == 2


def test_repeat_request_comes_from_cache(api) -> None:
    client, fake, _ = api
    first = client.post("/api/nearby", json=REQUEST).json()
    second = client.post("/api/nearby", json=REQUEST).json()
    assert first == second
    assert len(fake.requests) == 2


def test_crater_floor_is_darker_than_the_plain_around_it(api) -> None:
    client, _, state = api
    state["dem"] = make_polar_dem(crater, size=601, scale_m=500.0)

    body = client.post("/api/nearby", json={**REQUEST, "half_extent_km": 4, "step_km": 2}).json()
    n = len(body["east_m"])
    centre = body["spots"][(n * n) // 2]
    corner = body["spots"][0]

    assert centre["site_alt_m"] < -2500 < corner["site_alt_m"]
    assert centre["sunlit_pct"] < corner["sunlit_pct"]


def test_nodes_off_the_dem_are_null(api) -> None:
    client, _, state = api
    # A DEM 40 km across; a site 12 km from the pole with a ±10 km grid pokes out of it.
    state["dem"] = make_polar_dem(flat, size=41, scale_m=1000.0)

    body = client.post(
        "/api/nearby",
        json={**REQUEST, "lat": -89.6, "lon": 0.0, "half_extent_km": 10, "step_km": 5},
    ).json()

    assert None in body["spots"]
    assert any(s is not None for s in body["spots"])


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"half_extent_km": 10, "step_km": 0.25}, "too large"),
        ({"end": "2026-12-31T00:00:00Z", "step_minutes": 10}, "Too many time points"),
    ],
)
def test_oversized_requests_are_rejected(api, change, message) -> None:
    client, _, _ = api
    response = client.post("/api/nearby", json={**REQUEST, **change})
    assert response.status_code == 422
    assert message in response.text


def test_site_outside_the_dem_is_rejected(api) -> None:
    client, _, _ = api
    response = client.post("/api/nearby", json={**REQUEST, "lat": 0.67, "lon": 23.47})
    assert response.status_code == 422
    assert "needs terrain" in response.text


def test_no_dem_is_a_clear_error(api) -> None:
    client, _, state = api
    state["dem"] = None
    response = client.post("/api/nearby", json=REQUEST)
    assert response.status_code == 503


# --- timelines for the sunlight map (W6) -----------------------------------------------------


def unpack(bits: str, n: int) -> list[bool]:
    import base64

    raw = np.frombuffer(base64.b64decode(bits), dtype=np.uint8)
    return np.unpackbits(raw)[:n].astype(bool).tolist()


def test_timelines_are_off_by_default(api) -> None:
    client, _, _ = api
    assert client.post("/api/nearby", json=REQUEST).json()["timelines"] is None


def test_timelines_agree_with_each_node_and_with_analyze(api) -> None:
    client, _, state = api
    # A crater: its floor never sees the low Sun, the plain around it does.
    state["dem"] = make_polar_dem(crater, size=601, scale_m=500.0)

    body = client.post(
        "/api/nearby",
        json={**REQUEST, "half_extent_km": 4, "step_km": 2, "include_timelines": True},
    ).json()
    timelines = body["timelines"]
    n = timelines["samples"]

    # Same time samples as the single-site analysis of the same request.
    analysis = client.post(
        "/api/analyze", json={k: REQUEST[k] for k in ("lat", "lon", "start", "end", "step_minutes")}
    ).json()
    assert n == len(analysis["series"]["times"])
    assert len(timelines["sun"]) == len(timelines["earth"]) == len(body["spots"])

    # Each node's bits agree with its own totals, both ways.
    for spot, sun, earth in zip(body["spots"], timelines["sun"], timelines["earth"], strict=True):
        sun_bits, earth_bits = unpack(sun, n), unpack(earth, n)
        assert (sum(sun_bits) == 0) == (spot["sunlit_pct"] == 0)
        assert (sum(earth_bits) == 0) == (spot["earth_visible_pct"] == 0)


def test_sunlight_map_grid_covers_the_3d_patch(api) -> None:
    client, _, _ = api
    response = client.post("/api/nearby", json={**REQUEST, "half_extent_km": 20, "step_km": 2})
    assert response.status_code == 200, response.text
    assert len(response.json()["east_m"]) == 21
    assert response.json()["east_m"][0] == -20_000
