import numpy as np
import pytest

from app.config import Settings
from app.services import landing_api
from app.services.landing_api import get_hydrogen
from app.terrain.hydrogen import HYDROGEN_FILE


@pytest.fixture
def resources(tmp_path, monkeypatch):
    settings = Settings(resources_dir=tmp_path)
    monkeypatch.setattr(landing_api, "get_settings", lambda: settings)
    monkeypatch.setattr(landing_api, "_open_hydrogen", {})
    monkeypatch.setattr(landing_api, "_missing_warned", set())
    return tmp_path


def write_map(directory) -> None:
    # Big-endian int16 in tenths of a ppm, as on PDS: 123.4 ppm everywhere.
    np.full((360, 720), 1234, dtype=">i2").tofile(directory / HYDROGEN_FILE)


def test_map_downloaded_after_start_is_picked_up(resources) -> None:
    assert get_hydrogen() is None

    write_map(resources)  # what fetch_resources does while the server runs

    hydrogen = get_hydrogen()
    assert hydrogen is not None
    assert hydrogen.sample(-89.0, 45.0)[0] == pytest.approx(123.4)


def test_open_map_is_reused(resources) -> None:
    write_map(resources)
    assert get_hydrogen() is get_hydrogen()


def test_missing_map_is_reported_once(resources, caplog) -> None:
    with caplog.at_level("WARNING"):
        get_hydrogen()
        get_hydrogen()
    assert sum("No hydrogen map" in r.message for r in caplog.records) == 1
