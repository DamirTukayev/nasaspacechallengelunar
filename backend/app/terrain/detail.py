"""Local NAC stereo heights over the regional LOLA reference surface."""

from functools import lru_cache
from pathlib import Path

import numpy as np
import rasterio

from app.terrain.dem import PolarDEM


class RasterPatch:
    def __init__(self, path: Path):
        with rasterio.open(path) as src:
            params = src.crs.to_dict()
            if (
                params.get("proj") != "stere"
                or params.get("lat_0") != -90
                or params.get("lon_0", 0) != 0
                or abs(params.get("R", params.get("a", 0)) - 1737400) > 1
            ):
                raise ValueError(
                    "Detail raster must use south polar Moon stereographic coordinates"
                )
            self.data = src.read(1, masked=True).astype("float32").filled(np.nan)
            self.transform = src.transform
            self.scale = abs(src.transform.a)
        valid = np.isfinite(self.data)
        self.weight = np.zeros(self.data.shape, dtype="float32")
        # Feather across 120 m at the footprint and missing-data boundaries.
        steps = max(1, round(120 / self.scale))
        for _ in range(steps):
            self.weight += valid / steps
            padded = np.pad(valid, 1)
            valid = (
                padded[1:-1, :-2] & padded[1:-1, 2:] & padded[:-2, 1:-1] & padded[2:, 1:-1] & valid
            )

    def sample(self, x, y, *, weights=False):
        x, y = np.broadcast_arrays(np.asarray(x), np.asarray(y))
        inverse = ~self.transform
        col = inverse.a * x + inverse.b * y + inverse.c
        row = inverse.d * x + inverse.e * y + inverse.f
        col, row = col - 0.5, row - 0.5
        h, w = self.data.shape
        inside = (col >= 0) & (row >= 0) & (col <= w - 1) & (row <= h - 1)
        c = np.clip(np.floor(col), 0, w - 2).astype(int)
        r = np.clip(np.floor(row), 0, h - 2).astype(int)
        fc, fr = np.clip(col - c, 0, 1), np.clip(row - r, 0, 1)
        a = self.weight if weights else self.data
        values = (
            a[r, c] * (1 - fc) * (1 - fr)
            + a[r, c + 1] * fc * (1 - fr)
            + a[r + 1, c] * (1 - fc) * fr
            + a[r + 1, c + 1] * fc * fr
        )
        return np.where(inside, values, 0 if weights else np.nan)


@lru_cache(maxsize=8)
def open_raster(path: Path, stamp: int) -> RasterPatch:
    return RasterPatch(path)


class DetailedDEM(PolarDEM):
    def __init__(self, base: PolarDEM, patch: RasterPatch, version: str):
        super().__init__(base.heights, base.projection, f"{base.name}+SHACKRDGE02-{version}")
        self.base = base
        self.patch = patch

    def sample_xy(self, x, y):
        coarse = self.base.sample_xy(x, y)
        fine = self.patch.sample(x, y)
        weight = self.patch.sample(x, y, weights=True)
        return np.where(np.isfinite(fine), coarse * (1 - weight) + fine * weight, coarse)

    def sample_scale(self, lat: float, lon: float) -> float:
        x, y = self.projection.to_xy(lat, lon)
        return (
            self.patch.scale
            if self.patch.sample(x, y, weights=True) > 0
            else self.projection.map_scale_m
        )


@lru_cache(maxsize=8)
def _composite(base: PolarDEM, path: Path, stamp: int) -> DetailedDEM:
    return DetailedDEM(base, open_raster(path, stamp), f"v1-{path.stat().st_size}")


def with_detail(base: PolarDEM, directory: Path) -> PolarDEM:
    path = directory / "detail" / "ridge-dem.tif"
    if not path.exists():
        return base
    stamp = path.stat().st_mtime_ns
    return _composite(base, path, stamp)
