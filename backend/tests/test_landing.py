from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import Ephemeris, get_horizons_client
from app.services.horizon_mask import get_dem
from app.services.horizons import AzElSeries
from app.services.landing import (
    azel_to_vectors,
    longest_run,
    make_grid,
    search,
    slope_deg,
    vectors_to_azel,
)
from app.services.landing_api import get_hydrogen, get_landing_cache
from app.terrain.hydrogen import HydrogenMap
from tests.fakes import FakeHorizons, make_polar_dem


def flat(lat, lon):
    return np.zeros_like(lat)


def hydrogen_by_longitude() -> HydrogenMap:
    """H grows with east longitude, so the 'wettest' point is easy to predict."""
    lon_centers = np.arange(720) * 0.5 - 179.75
    return HydrogenMap(np.tile(100 + (lon_centers + 180) / 10, (360, 1)))


def constant_ephemeris(sun_el: float, earth_el: float, hours: int = 48) -> Ephemeris:
    t0 = datetime(2027, 1, 1, tzinfo=UTC)
    times = [t0 + timedelta(hours=h) for h in range(hours)]
    az = [(h * 15.0) % 360 for h in range(hours)]
    return Ephemeris(
        times=times,
        sun=AzElSeries(times, az, [sun_el] * hours),
        earth=AzElSeries(times, az, [earth_el] * hours),
    )


# --- hydrogen map -------------------------------------------------------------------------


def test_hydrogen_sample_hits_cell_centers_and_wraps() -> None:
    grid = np.zeros((360, 720))
    grid[0, 0] = 10.0
    grid[0, 719] = 30.0
    h = HydrogenMap(grid)
    assert h.sample(-89.75, -179.75)[0] == pytest.approx(10.0)
    assert h.sample(-89.75, 179.75)[0] == pytest.approx(30.0)
    # Halfway across the date line: mean of the two neighbours.
    assert h.sample(-89.75, 180.0)[0] == pytest.approx(20.0)


def test_hydrogen_rejects_wrong_shape() -> None:
    with pytest.raises(ValueError):
        HydrogenMap(np.zeros((10, 10)))


# --- geometry -----------------------------------------------------------------------------


def test_azel_vectors_round_trip_and_change_with_site() -> None:
    az = np.array([0.0, 90.0, 200.0, 359.0])
    el = np.array([5.0, -3.0, 45.0, 0.5])
    vectors = azel_to_vectors(-88.0, 0.0, az, el)
    back_az, back_el = vectors_to_azel(-88.0, 0.0, vectors)
    np.testing.assert_allclose(back_az, az, atol=1e-9)
    np.testing.assert_allclose(back_el, el, atol=1e-9)

    # Near the south pole, due south points at the pole. A body on the horizon there sits
    # one degree higher when seen from one degree closer to it.
    v = azel_to_vectors(-88.0, 0.0, np.array([180.0]), np.array([0.0]))
    _, el_closer = vectors_to_azel(-89.0, 0.0, v)
    assert el_closer[0] == pytest.approx(1.0, abs=1e-6)


def test_longest_run() -> None:
    assert longest_run(np.array([], dtype=bool)) == 0
    assert longest_run(np.array([False, False])) == 0
    assert longest_run(np.array([True, False, True, True, True, False, True, True])) == 3


def test_grid_is_a_disk_with_requested_spacing() -> None:
    dem = make_polar_dem(flat)
    grid = make_grid(dem, radius_km=20, spacing_km=5)
    r = np.hypot(grid.x_m, grid.y_m)
    assert r.max() <= 20_000
    # Integer (i, j) with i² + j² <= 4²: 49 points.
    assert grid.lat.size == 49
    assert np.all(grid.lat < -89)


def test_slope_of_a_tilted_plane() -> None:
    tilt = np.tan(np.radians(5.0))

    def plane(lat, lon):
        rho = 2 * 1_737_400 * np.tan(np.pi / 4 + np.radians(lat) / 2)
        return rho * np.sin(np.radians(lon)) * tilt  # height grows along +x

    dem = make_polar_dem(plane)
    s = slope_deg(dem, np.array([10_000.0]), np.array([-20_000.0]), baseline_m=2000)
    assert s[0] == pytest.approx(5.0, abs=0.05)


# --- search -------------------------------------------------------------------------------


def test_search_on_flat_ground_picks_most_hydrogen() -> None:
    dem = make_polar_dem(flat)
    eph = constant_ephemeris(sun_el=8.0, earth_el=-8.0)
    result = search(dem, hydrogen_by_longitude(), eph, radius_km=20, spacing_km=10)

    np.testing.assert_allclose(result.sunlit_pct, 100.0)
    np.testing.assert_allclose(result.earth_pct, 0.0)
    assert not result.cold_trap.any()
    assert result.eligible.all()
    assert result.best == int(np.argmax(result.hydrogen_ppm))
    assert result.ranking[0] == result.best
    assert set(result.scores) == {"terrain", "light", "comm", "resources"}


def test_search_never_picks_a_dark_site() -> None:
    dem = make_polar_dem(flat)
    eph = constant_ephemeris(sun_el=-8.0, earth_el=8.0)
    result = search(dem, hydrogen_by_longitude(), eph, radius_km=20, spacing_km=10)
    assert result.cold_trap.all()
    assert not result.eligible.any()
    assert result.ranking == []
    assert result.best is None
    np.testing.assert_allclose(result.longest_dark_h, 47.0)


# --- API ----------------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path):
    fake = FakeHorizons()
    app.dependency_overrides[get_dem] = lambda: make_polar_dem(flat)
    app.dependency_overrides[get_hydrogen] = hydrogen_by_longitude
    app.dependency_overrides[get_landing_cache] = lambda: JsonDiskCache(tmp_path)
    app.dependency_overrides[get_horizons_client] = lambda: fake.client()
    yield TestClient(app), fake
    app.dependency_overrides.clear()


def test_landing_search_endpoint_returns_and_caches(client) -> None:
    http, fake = client
    params = {
        "radius_km": 20,
        "spacing_km": 10,
        "start": "2026-12-01T00:00:00Z",
        "end": "2026-12-01T03:00:00Z",
        "step_minutes": 60,
    }
    first = http.get("/api/landing-search", params=params)
    assert first.status_code == 200, first.text
    body = first.json()
    n = len(body["points"]["lat"])
    assert n == 13
    assert all(len(v) == n for v in body["points"].values())
    assert 0 <= body["best"] < n
    assert body["terrain"]["size"] ** 2 == len(body["terrain"]["heights_m"])
    site = body["site_terrain"]
    assert site["size"] ** 2 == len(site["heights_m"])
    assert site["center_x_km"] == body["points"]["x_km"][body["best"]]
    assert site["center_y_km"] == body["points"]["y_km"][body["best"]]
    requests_after_first = len(fake.requests)

    second = http.get("/api/landing-search", params=params)
    assert second.json() == body
    assert len(fake.requests) == requests_after_first


def test_landing_search_without_data_is_503(client) -> None:
    http, _ = client
    app.dependency_overrides[get_hydrogen] = lambda: None
    assert http.get("/api/landing-search").status_code == 503


@pytest.mark.parametrize(
    "params",
    [
        {"start": "2027-02-01", "end": "2027-01-01"},
        {"start": "2027-01-01", "end": "2027-01-01"},
        {"start": "2027-01-01T00:00:00Z", "end": "2027-01-01T00:30:00Z", "step_minutes": 60},
        {"start": "2027-01-01", "end": "2030-01-01", "step_minutes": 60},
    ],
)
def test_invalid_landing_dates_are_422(client, params) -> None:
    http, fake = client
    response = http.get("/api/landing-search", params=params)
    assert response.status_code == 422
    assert fake.requests == []


def test_no_eligible_sites_have_no_selected_terrain(client, monkeypatch) -> None:
    from app.api import landing

    async def dark_ephemeris(*args, **kwargs):
        return constant_ephemeris(-8.0, 8.0)

    monkeypatch.setattr(landing, "get_ephemeris", dark_ephemeris)
    http, _ = client
    response = http.get("/api/landing-search", params={"radius_km": 20, "spacing_km": 10})
    assert response.status_code == 200
    body = response.json()
    assert body["best"] is None
    assert body["site_terrain"] is None
    assert body["ranking"] == []
    assert not any(body["points"]["eligible"])
    assert max(body["points"]["longest_dark_h"]) <= 47


def test_search_interpolates_sunset_and_earthset(monkeypatch) -> None:
    from types import SimpleNamespace

    from app.services import landing

    monkeypatch.setattr(
        landing,
        "compute_horizon",
        lambda *a, **kw: SimpleNamespace(
            azimuths=np.array([0.0, 180.0]), elevations=np.array([0.0, 0.0])
        ),
    )
    monkeypatch.setattr(
        landing,
        "vectors_to_azel",
        lambda *a: (np.array([0.0, 0.0, 0.0]), np.array([1.0, -1.0, -1.0])),
    )
    result = search(
        make_polar_dem(flat), hydrogen_by_longitude(), constant_ephemeris(5, 5, 3), 20, 10
    )
    # Earth sets halfway through the first hour; the Sun's upper limb sets slightly later.
    np.testing.assert_allclose(result.earth_pct, 25.0)
    np.testing.assert_allclose(result.longest_dark_h, 2 - (1 + 0.2666) / 2, atol=1 / 3600)
