"""Lunar Prospector Neutron Spectrometer hydrogen map (Feldman et al., 2001).

Hydrogen in the top ~1 m of regolith, ppm by weight, on a 0.5° simple cylindrical grid.
Near the poles high hydrogen is the best orbital proxy for water ice.
Binary product: 720 x 360 big-endian int16, value x 10; first row is the south pole,
first column starts at 180°W.
"""

from pathlib import Path

import numpy as np
from numpy.typing import ArrayLike, NDArray

HYDROGEN_URL = "https://pds-geosciences.wustl.edu/missions/lunarp/reduced/hydrogenhd.dat"
HYDROGEN_FILE = "hydrogenhd.dat"
HYDROGEN_SIZE = 720 * 360 * 2
CELL_DEG = 0.5


class HydrogenMap:
    def __init__(self, ppm: NDArray) -> None:
        if ppm.shape != (360, 720):
            raise ValueError(f"Expected a 360 x 720 grid, got {ppm.shape}")
        self.ppm = ppm

    @classmethod
    def open(cls, path: Path) -> "HydrogenMap":
        raw = np.fromfile(path, dtype=">i2")
        return cls(raw.reshape(360, 720).astype(float) / 10)

    def sample(self, lat: ArrayLike, lon: ArrayLike) -> NDArray:
        """Bilinear H ppm between cell centers, wrapping in longitude."""
        lat = np.atleast_1d(np.asarray(lat, dtype=float))
        lon = np.atleast_1d(np.asarray(lon, dtype=float))
        # Fractional index of cell centers: row 0 is centered at -89.75°, column 0 at -179.75°.
        row = np.clip((lat + 90) / CELL_DEG - 0.5, 0, 359)
        col = ((lon + 180) / CELL_DEG - 0.5) % 720

        r0 = np.minimum(np.floor(row).astype(int), 358)
        c0 = np.floor(col).astype(int) % 720
        c1 = (c0 + 1) % 720
        fr, fc = row - r0, col - np.floor(col)

        g = self.ppm
        top = g[r0, c0] * (1 - fc) + g[r0, c1] * fc
        bottom = g[r0 + 1, c0] * (1 - fc) + g[r0 + 1, c1] * fc
        return top * (1 - fr) + bottom * fr
