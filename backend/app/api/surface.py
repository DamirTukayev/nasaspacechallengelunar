"""Prepared visual assets; scientific heights are served by /api/terrain."""

from io import BytesIO
from typing import Annotated

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response
from PIL import Image

from app.config import get_settings
from app.services.horizon_mask import get_dem
from app.terrain.detail import open_raster
from app.terrain.geometry import projected_axes

router = APIRouter(prefix="/api/surface", tags=["terrain"])


@router.get("/globe/{asset}")
def globe_asset(asset: str):
    if asset not in ("globe-color.jpg", "globe-height.png"):
        raise HTTPException(404, "Unknown globe asset")
    path = get_settings().resources_dir / "detail" / asset
    if not path.exists():
        raise HTTPException(404, "Detailed assets are not installed")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/ortho")
def orthophoto(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    half_extent_km: Annotated[float, Query(ge=0.5, le=40)] = 4,
):
    dem = get_dem()
    path = get_settings().resources_dir / "detail" / "ridge-ortho.tif"
    if dem is None or not dem.covers(lat) or not path.exists():
        raise HTTPException(404, "No orthophoto for this site")
    raster = open_raster(path, path.stat().st_mtime_ns)
    lat = max(lat, -89.9999)
    n, e, scale = projected_axes(dem, lat, lon)
    x, y = dem.projection.to_xy(lat, lon)
    axis = np.linspace(-half_extent_km * 1000, half_extent_km * 1000, 1024)
    east, north = np.meshgrid(axis, axis[::-1])
    xs = x + scale * (east * e[0] + north * n[0])
    ys = y + scale * (east * e[1] + north * n[1])
    values = raster.sample(xs, ys)
    # Missing pixels remain neutral; this layer is explicitly labelled captured imagery.
    gray = np.where(np.isfinite(values), values, 150).clip(0, 255).astype("uint8")
    output = BytesIO()
    Image.fromarray(gray).save(output, format="PNG")
    return Response(
        output.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
