import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.site_catalog import load_catalog

client = TestClient(app)


def test_catalog_is_valid_and_sized_for_mvp() -> None:
    sites = load_catalog()

    assert 15 <= len(sites) <= 25
    assert {site.group for site in sites} == {"Apollo", "CLPS", "International", "South Pole"}


def test_catalog_has_south_pole_sites() -> None:
    polar = [site for site in load_catalog() if site.lat <= -80]

    assert len(polar) >= 5


def test_duplicate_ids_are_rejected(tmp_path: Path) -> None:
    site = load_catalog()[0].model_dump(mode="json")
    path = tmp_path / "sites.json"
    path.write_text(json.dumps([site, site]))

    with pytest.raises(ValueError, match="Duplicate site ids"):
        load_catalog(path)


def test_list_sites() -> None:
    response = client.get("/api/sites")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == len(load_catalog())
    assert set(body[0]) == {
        "id",
        "name",
        "group",
        "lat",
        "lon",
        "alt_m",
        "landing_date",
        "description",
        "source",
    }


def test_read_site() -> None:
    response = client.get("/api/sites/apollo-11")

    assert response.status_code == 200
    assert response.json()["name"] == "Apollo 11"
    assert response.json()["landing_date"] == "1969-07-20"


def test_read_unknown_site_returns_404() -> None:
    response = client.get("/api/sites/atlantis")

    assert response.status_code == 404
