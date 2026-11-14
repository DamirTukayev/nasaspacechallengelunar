from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analysis, ephemeris, health, horizon, sites, terrain
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

    app.include_router(health.router)
    app.include_router(sites.router)
    app.include_router(ephemeris.router)
    app.include_router(analysis.router)
    app.include_router(horizon.router)
    app.include_router(terrain.router)
    return app


app = create_app()
