import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api.terrain import get_terrain_cache
from app.main import app
from app.services.disk_cache import JsonDiskCache
from app.services.horizon_mask import get_dem
from app.terrain.patch import MOON_RADIUS_M, sphere_patch, terrain_patch
from tests.fakes import make_polar_dem

SITE = (-88.5, 0.0)


def flat(lat, lon):
    return np.zeros_like(lat)


def test_sphere_patch_sags_with_curvature() -> None:
    patch = sphere_patch(20_000, 41)
    h = patch.heights

    assert h[20, 20] == pytest.approx(0)
    # Edge midpoints are 20 km away: drop ≈ d² / 2R ≈ 115 m.
    assert h[0, 20] == pytest.approx(-(20_000**2) / (2 * MOON_RADIUS_M), rel=1e-3)
    assert h.max() <= 0


def test_flat_dem_matches_the_sphere() -> None:
    patch = terrain_patch(make_polar_dem(flat, size=801, scale_m=250), *SITE, 10_000, 21)

    assert patch.site_alt_m == pytest.approx(0)
    assert np.allclose(patch.heights, sphere_patch(10_000, 21).heights, atol=1.0)


def test_rows_run_north_to_south_and_columns_west_to_east() -> None:
    lat0, lon0 = SITE

    def tilted(lat, lon):
        # Ground rising to the north (away from the pole) and to the east.
        return (lat - lat0) * 30_000 + np.where(np.sin(np.radians(lon - lon0)) > 0, 500.0, 0.0)

    patch = terrain_patch(make_polar_dem(tilted, size=801, scale_m=250), *SITE, 10_000, 21)
    h = patch.heights

    assert h[0, 10] > h[20, 10] + 1000  # north edge well above the south edge
    assert h[10, 20] > h[10, 0] + 300  # east edge above the west edge


def test_site_outside_dem_is_rejected() -> None:
    with pytest.raises(ValueError, match="outside the DEM"):
        terrain_patch(make_polar_dem(flat), 0.0, 0.0, 10_000, 21)


@pytest.fixture
def api(tmp_path):
    state = {"dem": make_polar_dem(flat, size=801, scale_m=250)}
    app.dependency_overrides[get_dem] = lambda: state["dem"]
    app.dependency_overrides[get_terrain_cache] = lambda: JsonDiskCache(tmp_path)
    yield TestClient(app), state, tmp_path
    app.dependency_overrides.clear()


def test_terrain_endpoint_returns_a_cached_grid(api) -> None:
    client, _, cache_dir = api
    params = {"lat": SITE[0], "lon": SITE[1], "half_extent_km": 10, "size": 33}

    body = client.get("/api/terrain", params=params).json()

    assert body["kind"] == "terrain"
    assert body["size"] == 33
    assert len(body["heights"]) == 33 * 33
    assert body["half_extent_m"] == 10_000
    assert len(list(cache_dir.glob("*.json"))) == 1
    assert client.get("/api/terrain", params=params).json() == body


def test_terrain_endpoint_falls_back_to_a_sphere(api) -> None:
    client, state, _ = api
    state["dem"] = None

    body = client.get("/api/terrain", params={"lat": 0.67, "lon": 23.47, "size": 33}).json()

    assert body["kind"] == "sphere"
    assert body["site_alt_m"] is None
    assert max(body["heights"]) == 0


def test_terrain_endpoint_validates_size(api) -> None:
    client, _, _ = api
    assert client.get("/api/terrain", params={"lat": 0, "lon": 0, "size": 1000}).status_code == 422
