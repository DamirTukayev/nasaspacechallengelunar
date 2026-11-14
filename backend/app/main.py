from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

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


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")

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
    return app


app = create_app()
