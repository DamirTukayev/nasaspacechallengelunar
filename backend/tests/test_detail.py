import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from app.terrain.detail import DetailedDEM, RasterPatch, with_detail
from app.terrain.patch import terrain_patch
from tests.fakes import make_polar_dem


def write_raster(path):
    data = np.full((101, 101), 100, dtype="float32")
    data[45:55, 45:55] = -9999
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=101,
        height=101,
        count=1,
        dtype="float32",
        nodata=-9999,
        crs="+proj=stere +lat_0=-90 +lon_0=0 +R=1737400 +units=m",
        transform=from_origin(-505, 505, 10, 10),
    ) as dst:
        dst.write(data, 1)


def test_detail_uses_real_heights_and_falls_back_at_nodata(tmp_path):
    path = tmp_path / "ridge.tif"
    write_raster(path)
    base = make_polar_dem(lambda lat, lon: np.zeros_like(lat), size=101, scale_m=120)
    dem = DetailedDEM(base, RasterPatch(path), "test")
    heights = dem.sample_xy(np.array([300, 0, 900]), np.array([0, 0, 0]))
    assert heights == pytest.approx([100, 0, 0])
    # A soft transition at the dataset boundary avoids a vertical wall.
    edge = dem.sample_xy(np.array([480]), np.array([0]))[0]
    assert 0 < edge < 100
    lat, lon = base.projection.to_latlon(300, 0)
    assert dem.sample_scale(lat, lon) == 10
    patch = terrain_patch(dem, float(lat), float(lon), 200, 33)
    assert patch.site_alt_m == pytest.approx(100)
    assert abs(patch.heights[16, 16]) < 0.001
    assert np.isfinite(patch.heights).all()


def test_optional_detail_is_loaded_after_download_and_reused(tmp_path):
    base = make_polar_dem(lambda lat, lon: np.zeros_like(lat))
    assert with_detail(base, tmp_path) is base
    root = tmp_path / "detail"
    root.mkdir()
    write_raster(root / "ridge-dem.tif")
    first = with_detail(base, tmp_path)
    assert first is with_detail(base, tmp_path)
    assert first.name != base.name
