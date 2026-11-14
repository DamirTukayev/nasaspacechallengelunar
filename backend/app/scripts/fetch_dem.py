"""Download a LOLA south polar DEM from the PDS Geosciences Node.

python -m app.scripts.fetch_dem                  # default from settings (ldem_75s_120m)
python -m app.scripts.fetch_dem ldem_75s_240m    # smaller, coarser
"""

import sys
from pathlib import Path

import httpx

from app.config import get_settings
from app.terrain.dem import DEM_PRODUCTS, PDS_POLAR_URL


def done_mark(encoding: str | None = None) -> str:
    """A check mark if the console can print it, plain "OK" otherwise (e.g. cp1251 on Windows)."""
    try:
        "✓".encode(encoding or sys.stdout.encoding or "ascii")
    except (UnicodeEncodeError, LookupError):
        return "OK"
    return "✓"


def download(url: str, target: Path, expected_size: int | None = None) -> None:
    if target.exists() and (expected_size is None or target.stat().st_size == expected_size):
        print(f"{done_mark()} {target.name} already present")
        return

    partial = target.with_suffix(target.suffix + ".part")
    with httpx.stream("GET", url, timeout=120, follow_redirects=True) as response:
        response.raise_for_status()
        total = int(response.headers.get("content-length", 0)) or expected_size or 0
        done = 0
        with partial.open("wb") as f:
            for chunk in response.iter_bytes(1 << 20):
                f.write(chunk)
                done += len(chunk)
                if total:
                    print(f"\r  {target.name}: {done / total:6.1%}", end="", flush=True)
        print()

    if expected_size is not None and partial.stat().st_size != expected_size:
        raise SystemExit(f"{target.name}: size mismatch, try again")
    partial.replace(target)
    print(f"{done_mark()} {target.name}")


def main() -> None:
    settings = get_settings()
    name = sys.argv[1] if len(sys.argv) > 1 else settings.dem_name
    if name not in DEM_PRODUCTS:
        raise SystemExit(f"Unknown DEM {name!r}; choose one of {', '.join(DEM_PRODUCTS)}")

    settings.dem_dir.mkdir(parents=True, exist_ok=True)
    download(f"{PDS_POLAR_URL}/{name}.lbl", settings.dem_dir / f"{name}.lbl")
    download(f"{PDS_POLAR_URL}/{name}.img", settings.dem_dir / f"{name}.img", DEM_PRODUCTS[name])
    if name != settings.dem_name:
        print(f"Set DEM_NAME={name} in backend/.env to use it.")


if __name__ == "__main__":
    main()
