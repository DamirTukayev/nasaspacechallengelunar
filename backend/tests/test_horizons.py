import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizons import SUN, HorizonsClient, HorizonsError, parse_result
from tests.fakes import FIXTURE_SITE as SITE
from tests.fakes import FIXTURE_START as START
from tests.fakes import FIXTURE_STOP as STOP
from tests.fakes import FakeHorizons, fixture


def az_el(client: HorizonsClient, target: str = SUN):
    return asyncio.run(client.az_el(target, start=START, stop=STOP, step_minutes=60, **SITE))


def test_parse_recorded_sun_table() -> None:
    series = parse_result(json.loads(fixture("sun"))["result"])

    assert series.times == [datetime(2026, 12, 1, h, tzinfo=UTC) for h in range(4)]
    assert series.azimuth[0] == pytest.approx(281.604693471)
    assert series.elevation[-1] == pytest.approx(2.178202099)


def test_parse_without_table_raises() -> None:
    with pytest.raises(HorizonsError, match="No ephemeris table"):
        parse_result("header only\nsomething went wrong")


def test_request_describes_observer_on_the_moon() -> None:
    fake = FakeHorizons()
    az_el(fake.client())

    params = fake.requests[0].url.params
    assert params["CENTER"] == "'coord@301'"
    assert params["SITE_COORD"] == "'-1.670000,-85.980000,0.0000'"
    assert params["START_TIME"] == "'2026-12-01 00:00'"
    assert params["STEP_SIZE"] == "'60 m'"
    assert params["QUANTITIES"] == "'4'"


def test_cache_skips_network_on_repeat(tmp_path: Path) -> None:
    fake = FakeHorizons()
    client = fake.client(JsonDiskCache(tmp_path))

    first = az_el(client)
    second = az_el(client)

    assert len(fake.requests) == 1
    assert second == first


def test_horizons_error_field_is_reported() -> None:
    fake = FakeHorizons(override=httpx.Response(200, text=fixture("error")))

    with pytest.raises(HorizonsError, match="start must be earlier than stop"):
        az_el(fake.client())


def test_http_error_is_reported() -> None:
    body = {"code": "400", "message": "one or more query parameter was not recognized"}
    fake = FakeHorizons(override=httpx.Response(400, json=body))

    with pytest.raises(HorizonsError, match="HTTP 400: one or more query parameter"):
        az_el(fake.client())


def test_network_failure_is_reported() -> None:
    fake = FakeHorizons(override=httpx.ConnectTimeout("timed out"))

    with pytest.raises(HorizonsError, match="unreachable"):
        az_el(fake.client())


def test_get_ephemeris_combines_sun_and_earth() -> None:
    eph = asyncio.run(
        get_ephemeris(FakeHorizons().client(), start=START, stop=STOP, step_minutes=60, **SITE)
    )

    assert len(eph.times) == 4
    assert eph.sun.azimuth[0] == pytest.approx(281.604693471)
    assert eph.earth.azimuth[0] == pytest.approx(8.34607384)


@pytest.fixture
def api():
    fake = FakeHorizons()
    app.dependency_overrides[get_horizons_client] = lambda: fake.client()
    yield TestClient(app), fake
    app.dependency_overrides.clear()


QUERY = {"lat": -85.98, "lon": -1.67, "start": "2026-12-01T00:00", "end": "2026-12-01T03:00"}


def test_endpoint_returns_columnar_series(api) -> None:
    client, _ = api
    response = client.get("/api/ephemeris", params=QUERY)

    assert response.status_code == 200
    body = response.json()
    assert body["times"][0] == "2026-12-01T00:00:00Z"
    assert len(body["sun"]["elevation"]) == len(body["earth"]["azimuth"]) == 4
    assert body["step_minutes"] == 60


def test_endpoint_rejects_reversed_interval(api) -> None:
    client, _ = api
    response = client.get("/api/ephemeris", params={**QUERY, "end": "2026-11-30T00:00"})

    assert response.status_code == 422


def test_endpoint_rejects_too_many_points(api) -> None:
    client, fake = api
    response = client.get(
        "/api/ephemeris", params={**QUERY, "end": "2028-12-01T00:00", "step_minutes": 1}
    )

    assert response.status_code == 422
    assert fake.requests == []


def test_endpoint_maps_horizons_failure_to_502(api) -> None:
    client, fake = api
    fake.override = httpx.ConnectTimeout("timed out")

    response = client.get("/api/ephemeris", params=QUERY)

    assert response.status_code == 502
