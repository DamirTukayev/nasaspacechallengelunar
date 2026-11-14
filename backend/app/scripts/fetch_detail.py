"""Download the Shackleton ridge DTM/orthophoto and prepare globe textures."""

import shutil
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

from app.config import get_settings

PDS = "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001"
SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720"
FILES = {
    "ridge-dem.tif": f"{PDS}/DATA/SDP/NAC_DTM/SHACKRDGE02/NAC_DTM_SHACKRDGE02.TIF",
    "ridge-ortho.tif": (
        f"{PDS}/EXTRAS/BROWSE/NAC_DTM/SHACKRDGE02/NAC_DTM_SHACKRDGE02_M139797542_350CM.TIF"
    ),
    "globe-color.tif": f"{SVS}/lroc_color_poles_8k.tif",
    "globe-height.tif": f"{SVS}/ldem_16.tif",
}


def download(url: str, path: Path) -> None:
    if path.exists():
        return
    temporary = path.with_suffix(".part")
    print(f"Downloading {path.name}", flush=True)
    with urllib.request.urlopen(url, timeout=180) as source, temporary.open("wb") as target:
        shutil.copyfileobj(source, target)
    temporary.replace(path)


def main() -> None:
    root = get_settings().resources_dir / "detail"
    root.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        download(url, root / name)
    with Image.open(root / "globe-color.tif") as source:
        source.convert("RGB").save(root / "globe-color.jpg", quality=90, optimize=True)
    with Image.open(root / "globe-height.tif") as source:
        height = np.asarray(source, dtype=float)
        # Fixed encoding relative to the 1737.4 km reference sphere, in kilometers.
        encoded = np.clip((height + 10) / 21 * 255, 0, 255).astype("uint8")
        Image.fromarray(encoded).resize((4096, 2048), Image.Resampling.BILINEAR).save(
            root / "globe-height.png"
        )
    print("Detailed terrain and globe textures ready")


if __name__ == "__main__":
    main()
