"""Run the default landing-site search and save it for the frontend's offline mode.

python -m app.scripts.precompute_landing [output.json]

Default output: ../frontend/public/data/landing-search.json. The result also lands in the
backend cache, so the live API answers the default request instantly afterwards.
"""

import asyncio
import json
import sys
import time
from pathlib import Path

from app.api.landing import DEFAULT_END, DEFAULT_START
from app.config import BACKEND_DIR
from app.services.disk_cache import JsonDiskCache
from app.services.ephemeris import get_ephemeris, get_horizons_client
from app.services.horizon_mask import get_dem
from app.services.landing import REFERENCE_SITE, search
from app.services.landing_api import LandingParams, build_response, get_hydrogen, get_landing_cache

DEFAULT_OUTPUT = BACKEND_DIR.parent / "frontend" / "public" / "data" / "landing-search.json"


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
    dem, hydrogen = get_dem(), get_hydrogen()
    if dem is None:
        raise SystemExit("No DEM: run python -m app.scripts.fetch_dem")
    if hydrogen is None:
        raise SystemExit("No hydrogen map: run python -m app.scripts.fetch_resources")

    params = LandingParams(80.0, 5.0, DEFAULT_START, DEFAULT_END, 360, dem.name)
    lat, lon = REFERENCE_SITE
    eph = asyncio.run(
        get_ephemeris(get_horizons_client(), lat, lon, 0.0, params.start, params.end, 360)
    )

    t0 = time.time()

    def progress(done: int, total: int) -> None:
        if done % 50 == 0 or done == total:
            print(f"\r  {done}/{total} sites, {time.time() - t0:.0f} s", end="", flush=True)

    result = search(dem, hydrogen, eph, params.radius_km, params.spacing_km, progress=progress)
    print()
    payload = build_response(result, dem, eph, params)
    get_landing_cache().set(JsonDiskCache.make_key(params.cache_parts()), payload)

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, separators=(",", ":")))
    best = result.best
    print(
        f"Best site #{best}: {result.grid.lat[best]:.3f}°, {result.grid.lon[best]:.3f}°E, "
        f"score {result.total[best]:.3f}"
    )
    print(f"Saved {output} ({output.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
