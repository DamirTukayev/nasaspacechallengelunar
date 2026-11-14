"""Client for the JPL Horizons API: azimuth/elevation of a body seen from a point on the Moon."""

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from app.services.disk_cache import JsonDiskCache
from app.services.time_grid import to_utc

SUN = "10"
EARTH = "399"
MOON = "301"

_MONTHS = {
    m: i
    for i, m in enumerate(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
    )
}
_TIME_FORMAT = "%Y-%m-%d %H:%M"


class HorizonsError(Exception):
    """Horizons rejected the request, was unreachable, or returned something unexpected."""


@dataclass(frozen=True)
class AzElSeries:
    times: list[datetime]
    azimuth: list[float]
    elevation: list[float]

    def to_json(self) -> dict[str, Any]:
        return {
            "times": [t.isoformat() for t in self.times],
            "azimuth": self.azimuth,
            "elevation": self.elevation,
        }

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "AzElSeries":
        return cls(
            times=[datetime.fromisoformat(t) for t in data["times"]],
            azimuth=data["azimuth"],
            elevation=data["elevation"],
        )


def build_params(
    target: str,
    lat: float,
    lon: float,
    alt_m: float,
    start: datetime,
    stop: datetime,
    step_minutes: int,
) -> dict[str, str]:
    """Observer table of apparent (airless) azimuth/elevation from a site on the Moon."""
    return {
        "format": "json",
        "COMMAND": f"'{target}'",
        "CENTER": f"'coord@{MOON}'",
        "COORD_TYPE": "'GEODETIC'",
        # East longitude, latitude (degrees), altitude (km) above the reference sphere.
        "SITE_COORD": f"'{lon:.6f},{lat:.6f},{alt_m / 1000:.4f}'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "START_TIME": f"'{to_utc(start).strftime(_TIME_FORMAT)}'",
        "STOP_TIME": f"'{to_utc(stop).strftime(_TIME_FORMAT)}'",
        "STEP_SIZE": f"'{step_minutes} m'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
        "TIME_DIGITS": "'MINUTES'",
        "EXTRA_PREC": "'YES'",
        "OBJ_DATA": "'NO'",
    }


def _parse_time(raw: str) -> datetime:
    # e.g. "2026-Dec-01 00:00"
    date_part, time_part = raw.strip().split()
    year, month, day = date_part.split("-")
    hour, minute = time_part.split(":")
    return datetime(int(year), _MONTHS[month], int(day), int(hour), int(minute), tzinfo=UTC)


def parse_result(text: str) -> AzElSeries:
    """Parse the CSV table between $$SOE and $$EOE of a Horizons observer ephemeris."""
    try:
        start = text.index("$$SOE") + len("$$SOE")
        end = text.index("$$EOE", start)
    except ValueError:
        tail = text.strip().splitlines()[-1] if text.strip() else "empty response"
        raise HorizonsError(f"No ephemeris table in Horizons response: {tail}") from None

    times: list[datetime] = []
    azimuth: list[float] = []
    elevation: list[float] = []
    for line in text[start:end].strip().splitlines():
        # "<time>,<solar flag>,<lunar flag>,<azimuth>,<elevation>,"
        parts = line.split(",")
        try:
            times.append(_parse_time(parts[0]))
            azimuth.append(float(parts[3]))
            elevation.append(float(parts[4]))
        except (IndexError, KeyError, ValueError) as exc:
            raise HorizonsError(f"Unexpected Horizons row: {line!r}") from exc

    if not times:
        raise HorizonsError("Horizons returned an empty ephemeris table")
    return AzElSeries(times=times, azimuth=azimuth, elevation=elevation)


class HorizonsClient:
    def __init__(
        self,
        base_url: str,
        timeout_s: float = 60.0,
        cache: JsonDiskCache | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        max_concurrent: int = 2,
        busy_retries: int = 3,
        busy_delay_s: float = 1.0,
    ) -> None:
        self.base_url = base_url
        self.timeout_s = timeout_s
        self.cache = cache
        # Injected in tests; otherwise a fresh transport per request (the client closes it).
        self._transport = transport
        # Horizons answers 503 when one address sends several requests at once, so requests
        # wait for a free slot, and a 503 is retried with a growing pause.
        self._slots = asyncio.Semaphore(max_concurrent)
        self.busy_retries = busy_retries
        self.busy_delay_s = busy_delay_s

    async def az_el(
        self,
        target: str,
        lat: float,
        lon: float,
        alt_m: float,
        start: datetime,
        stop: datetime,
        step_minutes: int,
        use_cache: bool = True,
    ) -> AzElSeries:
        """use_cache=False skips the whole-request cache (callers that cache by day do that)."""
        params = build_params(target, lat, lon, alt_m, start, stop, step_minutes)

        key = JsonDiskCache.make_key(params) if self.cache and use_cache else None
        if self.cache and key:
            cached = self.cache.get(key)
            if cached is not None:
                return AzElSeries.from_json(cached)

        series = parse_result(await self._fetch(params))

        if self.cache and key:
            self.cache.set(key, series.to_json())
        return series

    async def _fetch(self, params: dict[str, str]) -> str:
        transport = self._transport or httpx.AsyncHTTPTransport(retries=2)
        async with (
            self._slots,
            httpx.AsyncClient(transport=transport, timeout=self.timeout_s) as client,
        ):
            for attempt in range(self.busy_retries + 1):
                try:
                    response = await client.get(self.base_url, params=params)
                except httpx.HTTPError as exc:
                    raise HorizonsError(f"Horizons is unreachable: {exc!r}") from exc
                if response.status_code != 503 or attempt == self.busy_retries:
                    break
                await asyncio.sleep(self.busy_delay_s * 2**attempt)

        try:
            payload = response.json()
        except ValueError:
            raise HorizonsError(f"Horizons returned HTTP {response.status_code}") from None

        if response.status_code != 200:
            message = payload.get("message") or payload.get("error") or response.text[:200]
            raise HorizonsError(f"Horizons returned HTTP {response.status_code}: {message}")
        if payload.get("error"):
            raise HorizonsError(f"Horizons error: {payload['error'].strip()}")
        return payload.get("result", "")
