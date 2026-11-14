import numpy as np
import pytest

from app.config import Settings
from app.scripts.fetch_dem import done_mark
from app.services import horizon_mask
from app.services.horizon_mask import get_dem

SIZE = 4
LABEL = f"""
    LINES                 = {SIZE}
    LINE_SAMPLES          = {SIZE}
    SCALING_FACTOR        = 0.5
 A_AXIS_RADIUS                = 1737.4 <km>
 CENTER_LATITUDE              = -90 <deg>
 MAP_SCALE                    = 120 <m/pix>
 MAXIMUM_LATITUDE             = -89.9 <deg>
 LINE_PROJECTION_OFFSET       = 2.0 <pix>
 SAMPLE_PROJECTION_OFFSET     = 2.0 <pix>
"""


@pytest.fixture
def dem_dir(tmp_path, monkeypatch):
    settings = Settings(dem_dir=tmp_path, dem_name="test_dem")
    monkeypatch.setattr(horizon_mask, "get_settings", lambda: settings)
    monkeypatch.setattr(horizon_mask, "_open_dems", {})
    monkeypatch.setattr(horizon_mask, "_missing_warned", set())
    return tmp_path


def write_dem(directory) -> None:
    (directory / "test_dem.lbl").write_text(LABEL)
    np.full((SIZE, SIZE), 200, dtype="<i2").tofile(directory / "test_dem.img")


def test_dem_downloaded_after_start_is_picked_up(dem_dir) -> None:
    assert get_dem() is None

    write_dem(dem_dir)

    dem = get_dem()
    assert dem is not None
    assert dem.height(-90.0, 0.0) == pytest.approx(100.0)  # 200 × scaling factor 0.5


def test_open_dem_is_reused(dem_dir) -> None:
    write_dem(dem_dir)
    assert get_dem() is get_dem()


@pytest.mark.parametrize(
    ("encoding", "expected"),
    [("utf-8", "✓"), ("cp1251", "OK"), ("ascii", "OK"), ("no-such-codec", "OK")],
)
def test_done_mark_never_breaks_the_console(encoding, expected) -> None:
    assert done_mark(encoding) == expected
