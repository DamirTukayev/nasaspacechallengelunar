"""Horizons answers 503 to parallel requests from one address: queue and retry, do not fail."""

import asyncio

import httpx
import pytest

from app.services.horizons import SUN, HorizonsClient, HorizonsError
from tests.fakes import FIXTURE_SITE as SITE
from tests.fakes import FIXTURE_START as START
from tests.fakes import FIXTURE_STOP as STOP
from tests.fakes import fixture


def make_client(handler, **kwargs) -> HorizonsClient:
    return HorizonsClient(
        "https://horizons.test/api",
        transport=httpx.MockTransport(handler),
        busy_delay_s=0,
        **kwargs,
    )


def az_el(client: HorizonsClient, lat_shift: float = 0.0):
    site = {**SITE, "lat": SITE["lat"] + lat_shift}
    return client.az_el(SUN, start=START, stop=STOP, step_minutes=60, **site)


def test_busy_answer_is_retried() -> None:
    answers = iter([httpx.Response(503), httpx.Response(503)])
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return next(answers, None) or httpx.Response(200, text=fixture("sun"))

    series = asyncio.run(az_el(make_client(handler)))

    assert len(series.times) == 4
    assert len(calls) == 3


def test_persistent_busy_answer_is_reported() -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(503)

    with pytest.raises(HorizonsError, match="HTTP 503"):
        asyncio.run(az_el(make_client(handler, busy_retries=2)))
    assert len(calls) == 3


def test_parallel_requests_wait_for_a_free_slot() -> None:
    in_flight = 0
    peak = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return httpx.Response(200, text=fixture("sun"))

    async def run_many():
        client = make_client(handler, max_concurrent=2)
        # Three analyses at once = six Horizons requests.
        return await asyncio.gather(*(az_el(client, lat_shift=0.01 * i) for i in range(6)))

    results = asyncio.run(run_many())

    assert len(results) == 6
    assert peak == 2


def test_identical_requests_share_one_fetch_and_survive_waiter_cancellation():
    calls = 0

    async def handler(request):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.02)
        return httpx.Response(200, text=fixture("sun"))

    async def run():
        client = make_client(handler)
        visitors = [asyncio.create_task(az_el(client)) for _ in range(8)]
        await asyncio.sleep(0.005)
        visitors[0].cancel()
        results = await asyncio.gather(*visitors, return_exceptions=True)
        assert isinstance(results[0], asyncio.CancelledError)
        assert all(len(result.times) == 4 for result in results[1:])
        assert not client._pending

    asyncio.run(run())
    assert calls == 1


def test_failed_shared_fetch_can_be_retried():
    calls = 0

    async def handler(request):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.001)
        return httpx.Response(503) if calls == 1 else httpx.Response(200, text=fixture("sun"))

    async def run():
        client = make_client(handler, busy_retries=0)
        results = await asyncio.gather(az_el(client), az_el(client), return_exceptions=True)
        assert all(isinstance(result, HorizonsError) for result in results)
        assert len((await az_el(client)).times) == 4

    asyncio.run(run())
    assert calls == 2
