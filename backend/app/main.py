import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api import (
    analysis,
    calendar,
    ephemeris,
    health,
    horizon,
    landing,
    nearby,
    sites,
    surface,
    terrain,
)
from app.config import get_settings

log = logging.getLogger(__name__)


class ServerErrorsAsJson:
    """Turn unhandled errors into a JSON 500 inside the CORS middleware.

    Starlette builds its own 500 outside every middleware, so that response has no CORS
    headers; the browser then hides it and the page reports the backend as unreachable.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = False

        async def tracked(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracked)
        except Exception:
            if started:  # Too late for a clean error response.
                raise
            log.exception("Unhandled error in %s %s", scope.get("method"), scope.get("path"))
            response = JSONResponse({"detail": "Internal server error"}, status_code=500)
            await response(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.warm_ephemeris import refresh_catalog

    task = asyncio.create_task(refresh_catalog())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    # Added first, so it runs inside CORS and its 500 responses carry CORS headers.
    app.add_middleware(ServerErrorsAsJson)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Analysis responses are long JSON number arrays: a year of hourly data is ~1 MB raw and
    # ~0.37 MB gzipped. Tiny responses are not worth compressing.
    app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)

    app.include_router(health.router)
    app.include_router(sites.router)
    app.include_router(ephemeris.router)
    app.include_router(analysis.router)
    app.include_router(horizon.router)
    app.include_router(terrain.router)
    app.include_router(surface.router)
    app.include_router(nearby.router)
    app.include_router(calendar.router)
    app.include_router(landing.router)

    from fastapi.exceptions import RequestValidationError

    from app.errors import validation_error_handler

    app.add_exception_handler(RequestValidationError, validation_error_handler)
    return app


app = create_app()
