import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_horizons_client
from app.services.horizon_mask import (
    TerrainHorizon,
    get_dem,
    get_horizon_cache,
    horizon_for_site,
)
from app.terrain.dem import PolarProjection
from app.terrain.horizon import compute_horizon
from tests.fakes import FakeHorizons, make_polar_dem

R = 1_737_400.0
SITE = (-88.5, 0.0)  # ~45 km from the pole, well inside the synthetic grid


def flat(lat, lon):
    return np.zeros_like(lat)


def surface_distance_m(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians([lat1, lon1]), np.radians([lat2, lon2])
    cos_c = np.sin(p1[0]) * np.sin(p2[0]) + np.cos(p1[0]) * np.cos(p2[0]) * np.cos(p2[1] - p1[1])
    return R * np.arccos(np.clip(cos_c, -1, 1))


# --- projection ---------------------------------------------------------------------------


LABEL = """
    LINES                 = 7624
    LINE_SAMPLES          = 7624
    SCALING_FACTOR        = 0.5
 A_AXIS_RADIUS                = 1737.4 <km>
 CENTER_LATITUDE              = -90 <deg>
 MAP_SCALE                    = 120 <m/pix>
 MAXIMUM_LATITUDE             = -75 <deg>
 LINE_PROJECTION_OFFSET       = 3811.5 <pix>
 SAMPLE_PROJECTION_OFFSET     = 3811.5 <pix>
"""


def test_label_parsing_and_grid_edge_at_75s() -> None:
    proj = PolarProjection.from_label(LABEL)

    assert proj.radius_m == R
    assert proj.scaling_factor == 0.5
    # The 75°S parallel touches the grid edge: 3811.5 px × 120 m from the pole.
    x, y = proj.to_xy(-75.0, 90.0)
    assert x == pytest.approx(3811.5 * 120, rel=1e-3)
    assert y == pytest.approx(0, abs=1e-6)


def test_projection_round_trip() -> None:
    proj = PolarProjection.from_label(LABEL)
    lat, lon = proj.to_latlon(*proj.to_xy(-85.98, -1.67))

    assert lat == pytest.approx(-85.98)
    assert lon == pytest.approx(-1.67)


def test_pole_is_at_grid_center() -> None:
    proj = PolarProjection.from_label(LABEL)
    row, col = proj.to_pixel(*proj.to_xy(-90.0, 0.0))

    assert row == pytest.approx(3811.0)
    assert col == pytest.approx(3811.0)


def test_bilinear_sampling_and_outside_is_nan() -> None:
    dem = make_polar_dem(lambda lat, lon: (lat + 90) * 1000)

    assert dem.height(-89.0, 45.0) == pytest.approx(1000, rel=0.01)
    assert np.isnan(dem.height(-80.0, 0.0))


# --- horizon ------------------------------------------------------------------------------


def test_flat_terrain_horizon_is_the_geometric_dip() -> None:
    profile = compute_horizon(make_polar_dem(flat), *SITE, observer_height_m=2.0)

    # On a bare sphere the skyline sits slightly below horizontal: −sqrt(2h/R).
    dip = -np.degrees(np.sqrt(2 * 2.0 / R))
    assert profile.site_alt_m == pytest.approx(0)
    assert np.allclose(profile.elevations, dip, atol=0.01)


def test_ring_of_hills_raises_the_skyline_everywhere() -> None:
    def ring(lat, lon):
        return np.where(surface_distance_m(*SITE, lat, lon) > 10_000, 1000.0, 0.0)

    profile = compute_horizon(make_polar_dem(ring, size=801, scale_m=250), *SITE)

    expected = np.degrees(np.arctan(1000 / 10_000))
    assert profile.elevations.min() > expected - 1.0
    assert profile.elevations.max() < expected + 0.5


def test_azimuths_match_compass_directions() -> None:
    """A hill north of the site shows up at 0°, a hill east of it at 90°."""
    lat0, lon0 = SITE
    north_hill = (lat0 + 0.15, lon0)  # further from the pole = north
    east_hill = (lat0, lon0 + 6.0)  # increasing east longitude

    def hills(lat, lon):
        near_north = surface_distance_m(*north_hill, lat, lon) < 2000
        near_east = surface_distance_m(*east_hill, lat, lon) < 2000
        return np.where(near_north | near_east, 2000.0, 0.0)

    profile = compute_horizon(make_polar_dem(hills, size=801, scale_m=250), lat0, lon0)
    mask = TerrainHorizon(profile.azimuths.tolist(), profile.elevations.tolist())

    assert mask.elevation(0) > 10
    assert mask.elevation(90) > 10
    assert mask.elevation(180) < 0.5
    assert mask.elevation(270) < 0.5


def test_terrain_mask_interpolates_across_north() -> None:
    mask = TerrainHorizon([0.0, 90.0, 180.0, 270.0], [0.0, 1.0, 2.0, 4.0])

    assert mask.elevation(315) == pytest.approx(2.0)
    assert mask.elevation(-45) == pytest.approx(2.0)


# --- site horizons and caching ------------------------------------------------------------


def test_site_outside_dem_gets_a_sphere(tmp_path) -> None:
    horizon = horizon_for_site(0.67, 23.47, 2.0, make_polar_dem(flat), JsonDiskCache(tmp_path))

    assert horizon.mask.kind == "sphere"
    assert horizon.site_alt_m is None
    assert set(horizon.elevations) == {0.0}


def test_no_dem_gets_a_sphere(tmp_path) -> None:
    assert horizon_for_site(*SITE, 2.0, None, JsonDiskCache(tmp_path)).mask.kind == "sphere"


def test_site_horizon_is_cached(tmp_path) -> None:
    cache = JsonDiskCache(tmp_path)
    first = horizon_for_site(*SITE, 2.0, make_polar_dem(flat), cache)

    assert first.mask.kind == "terrain"
    assert len(list(tmp_path.glob("*.json"))) == 1

    second = horizon_for_site(*SITE, 2.0, make_polar_dem(flat), cache)
    assert second.elevations == first.elevations


# --- endpoints ----------------------------------------------------------------------------


@pytest.fixture
def api(tmp_path):
    state = {"dem": make_polar_dem(flat)}
    fake = FakeHorizons()
    app.dependency_overrides[get_dem] = lambda: state["dem"]
    app.dependency_overrides[get_horizon_cache] = lambda: JsonDiskCache(tmp_path)
    app.dependency_overrides[get_horizons_client] = lambda: fake.client()
    yield TestClient(app), state
    app.dependency_overrides.clear()


def test_horizon_endpoint_returns_terrain_profile(api) -> None:
    client, _ = api
    response = client.get("/api/horizon", params={"lat": SITE[0], "lon": SITE[1]})

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "terrain"
    assert body["dem"] == "synthetic"
    assert len(body["azimuths"]) == len(body["elevations"]) == 720


def test_horizon_endpoint_without_dem_is_flat(api) -> None:
    client, state = api
    state["dem"] = None

    body = client.get("/api/horizon", params={"lat": SITE[0], "lon": SITE[1]}).json()

    assert body["kind"] == "sphere"
    assert body["site_alt_m"] is None


def test_crater_walls_put_the_site_in_shadow(api) -> None:
    """Recorded Malapert ephemeris: Sun ~2° up. A 2 km wall 5 km away hides it."""
    client, state = api
    site = (-85.98, -1.67)

    def crater(lat, lon):
        return np.where(surface_distance_m(*site, lat, lon) > 5000, 2000.0, 0.0)

    state["dem"] = make_polar_dem(crater, size=301, scale_m=1000)
    scenario = {
        "lat": site[0],
        "lon": site[1],
        "start": "2026-12-01T00:00:00Z",
        "end": "2026-12-01T03:00:00Z",
    }

    body = client.post("/api/analyze", json=scenario).json()

    assert body["horizon_kind"] == "terrain"
    assert body["metrics"]["sunlit_pct"] == 0
    assert body["metrics"]["earth_visible_pct"] == 0
    assert body["metrics"]["verdict"] == "red"
    assert min(body["series"]["sun"]["skyline"]) > 15
