import io

import numpy as np
from fastapi.testclient import TestClient

from app.api.nearby import get_nearby_cache
from app.main import app
from app.schemas.site import Site
from app.scripts import warm_cache
from app.services import nearby as nearby_service
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_horizons_client
from app.services.horizon_mask import get_dem, get_horizon_cache
from tests.fakes import FIXTURE_SITE, FakeHorizons, make_polar_dem


def ridge(lat, lon):
    return 400 * np.sin(np.radians(lon) * 4)


def catalog_site(site_id: str, lat: float, lon: float) -> Site:
    return Site.model_validate(
        {
            "id": site_id,
            "name": site_id,
            "group": "South Pole",
            "lat": lat,
            "lon": lon,
            "alt_m": None,
            "landing_date": None,
            "description": "",
            "source": "https://example.org",
        }
    )


def setup(monkeypatch, tmp_path):
    dem = make_polar_dem(ridge)
    sites = (
        catalog_site("malapert", FIXTURE_SITE["lat"], FIXTURE_SITE["lon"]),
        catalog_site("apollo", 0.67, 23.47),  # off the DEM: skipped
    )
    horizon_cache = JsonDiskCache(tmp_path / "horizon")
    terrain_cache = JsonDiskCache(tmp_path / "terrain")
    monkeypatch.setattr(warm_cache, "get_dem", lambda: dem)
    monkeypatch.setattr(warm_cache, "get_sites", lambda: sites)
    monkeypatch.setattr(warm_cache, "get_horizon_cache", lambda: horizon_cache)
    monkeypatch.setattr(warm_cache, "get_terrain_cache", lambda: terrain_cache)
    return dem, horizon_cache, terrain_cache


def test_warms_polar_sites_only(monkeypatch, tmp_path) -> None:
    setup(monkeypatch, tmp_path)
    out = io.StringIO()

    assert warm_cache.warm(out) == 1

    # Site skyline + 121 map nodes, and one terrain patch.
    assert len(list((tmp_path / "horizon").glob("*.json"))) == 1 + 121
    assert len(list((tmp_path / "terrain").glob("*.json"))) == 1
    assert "Precomputed 1 polar sites" in out.getvalue()


def test_without_a_dem_it_does_nothing(monkeypatch, tmp_path) -> None:
    setup(monkeypatch, tmp_path)
    monkeypatch.setattr(warm_cache, "get_dem", lambda: None)
    assert warm_cache.warm(io.StringIO()) == 0


def test_after_warming_the_map_computes_no_skylines(monkeypatch, tmp_path) -> None:
    dem, horizon_cache, _ = setup(monkeypatch, tmp_path)
    warm_cache.warm(io.StringIO())

    def no_compute(*args, **kwargs):
        raise AssertionError("skyline should have come from the warmed cache")

    monkeypatch.setattr(nearby_service, "compute_horizon", no_compute)
    fake = FakeHorizons()
    app.dependency_overrides[get_horizons_client] = lambda: fake.client()
    app.dependency_overrides[get_dem] = lambda: dem
    app.dependency_overrides[get_horizon_cache] = lambda: horizon_cache
    app.dependency_overrides[get_nearby_cache] = lambda: JsonDiskCache(tmp_path / "nearby")
    try:
        response = TestClient(app).post(
            "/api/nearby",
            json={
                "lat": FIXTURE_SITE["lat"],
                "lon": FIXTURE_SITE["lon"],
                "start": "2026-12-01T00:00:00Z",
                "end": "2026-12-01T03:00:00Z",
                "step_minutes": 60,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert len(response.json()["spots"]) == 121
