"""Measure eight simultaneous catalog analyses on an explicit, previously unused UTC date.

python -m app.scripts.benchmark_analysis --start 2030-01-15 --url http://127.0.0.1:8000
"""

import argparse
import asyncio
import json
import time
from datetime import datetime, timedelta

import httpx


async def run(url: str, start: str) -> None:
    begin = datetime.fromisoformat(start)
    async with httpx.AsyncClient(base_url=url, timeout=180) as client:
        response = await client.get("/api/sites")
        response.raise_for_status()
        sites = response.json()[:8]

        async def one(site):
            started = time.monotonic()
            response = await client.post(
                "/api/analyze",
                json={
                    "lat": site["lat"],
                    "lon": site["lon"],
                    "start": begin.isoformat(),
                    "end": (begin + timedelta(days=30)).isoformat(),
                    "step_minutes": 60,
                },
            )
            return {
                "site": site["id"],
                "status": response.status_code,
                "seconds": round(time.monotonic() - started, 2),
            }

        result = await asyncio.gather(*(one(site) for site in sites))
        print(json.dumps(result, indent=2))
        if any(item["status"] != 200 for item in result):
            raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--start", required=True)
    args = parser.parse_args()
    asyncio.run(run(args.url, args.start))
