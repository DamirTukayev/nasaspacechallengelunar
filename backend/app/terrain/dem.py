"""LOLA polar stereographic DEMs (PDS3 IMG + LBL)."""

import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import ArrayLike, NDArray

PDS_POLAR_URL = (
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img"
)

# South polar products that cover sites down to 75°S. Sizes are for the .img files.
DEM_PRODUCTS = {
    "ldem_75s_120m": 116_250_752,
    "ldem_75s_240m": 29_062_688,
}


@dataclass(frozen=True)
class PolarProjection:
    """Spherical polar stereographic projection, as described in a LOLA GDR label."""

    lines: int
    samples: int
    map_scale_m: float
    line_offset: float
    sample_offset: float
    radius_m: float
    center_lat: float
    scaling_factor: float
    max_lat: float

    @classmethod
    def from_label(cls, text: str) -> "PolarProjection":
        def value(key: str) -> float:
            match = re.search(rf"^\s*{key}\s*=\s*([-+0-9.]+)", text, re.MULTILINE)
            if not match:
                raise ValueError(f"{key} not found in label")
            return float(match.group(1))

        return cls(
            lines=int(value("LINES")),
            samples=int(value("LINE_SAMPLES")),
            map_scale_m=value("MAP_SCALE"),
            line_offset=value("LINE_PROJECTION_OFFSET"),
            sample_offset=value("SAMPLE_PROJECTION_OFFSET"),
            radius_m=value("A_AXIS_RADIUS") * 1000,
            center_lat=value("CENTER_LATITUDE"),
            scaling_factor=value("SCALING_FACTOR"),
            max_lat=value("MAXIMUM_LATITUDE"),
        )

    def to_xy(self, lat: ArrayLike, lon: ArrayLike) -> tuple[NDArray, NDArray]:
        """Projected meters. South pole aspect: +x toward 90°E, +y toward 0°E."""
        if self.center_lat != -90:
            raise NotImplementedError("Only south polar DEMs are supported")
        lat_r, lon_r = np.radians(lat), np.radians(lon)
        rho = 2 * self.radius_m * np.tan(np.pi / 4 + lat_r / 2)
        return rho * np.sin(lon_r), rho * np.cos(lon_r)

    def to_latlon(self, x: ArrayLike, y: ArrayLike) -> tuple[NDArray, NDArray]:
        x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
        rho = np.hypot(x, y)
        lat = np.degrees(2 * np.arctan(rho / (2 * self.radius_m)) - np.pi / 2)
        lon = np.degrees(np.arctan2(x, y))
        return lat, lon

    def to_pixel(self, x: ArrayLike, y: ArrayLike) -> tuple[NDArray, NDArray]:
        """Fractional 0-based (row, col) of pixel centers."""
        col = self.sample_offset + np.asarray(x) / self.map_scale_m - 0.5
        row = self.line_offset - np.asarray(y) / self.map_scale_m - 0.5
        return row, col


class PolarDEM:
    """Heights (meters above the 1737.4 km sphere) with bilinear sampling."""

    def __init__(self, heights: NDArray, projection: PolarProjection, name: str = "dem") -> None:
        self.heights = heights
        self.projection = projection
        self.name = name

    @classmethod
    def open(cls, img_path: Path, label_path: Path) -> "PolarDEM":
        projection = PolarProjection.from_label(label_path.read_text())
        raw = np.memmap(
            img_path, dtype="<i2", mode="r", shape=(projection.lines, projection.samples)
        )
        return cls(raw, projection, name=img_path.stem)

    def sample_scale(self, lat: float, lon: float) -> float:
        return self.projection.map_scale_m

    def covers(self, lat: float) -> bool:
        return lat <= self.projection.max_lat

    def sample_xy(self, x: ArrayLike, y: ArrayLike) -> NDArray:
        """Bilinear height at projected coordinates; NaN outside the grid."""
        row, col = self.projection.to_pixel(x, y)
        row, col = np.atleast_1d(row).astype(float), np.atleast_1d(col).astype(float)
        n_rows, n_cols = self.heights.shape

        inside = (row >= 0) & (row <= n_rows - 1) & (col >= 0) & (col <= n_cols - 1)
        r = np.clip(row, 0, n_rows - 1)
        c = np.clip(col, 0, n_cols - 1)
        r0 = np.minimum(np.floor(r).astype(int), n_rows - 2)
        c0 = np.minimum(np.floor(c).astype(int), n_cols - 2)
        fr, fc = r - r0, c - c0

        h = self.heights
        top = h[r0, c0] * (1 - fc) + h[r0, c0 + 1] * fc
        bottom = h[r0 + 1, c0] * (1 - fc) + h[r0 + 1, c0 + 1] * fc
        values = (top * (1 - fr) + bottom * fr) * self.projection.scaling_factor
        return np.where(inside, values, np.nan)

    def height(self, lat: float, lon: float) -> float:
        x, y = self.projection.to_xy(lat, lon)
        return float(self.sample_xy(x, y)[0])
