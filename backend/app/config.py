from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Lunar Site Planner API"
    cors_origins: Annotated[list[str], NoDecode] = []
    # Any port on localhost is allowed by default for local development.
    cors_origin_regex: str | None = r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"

    horizons_url: str = "https://ssd.jpl.nasa.gov/api/horizons.api"
    horizons_timeout_s: float = 60.0
    cache_dir: Path = BACKEND_DIR / "data" / "cache"

    # LOLA south polar DEM, downloaded with `python -m app.scripts.fetch_dem`.
    dem_dir: Path = BACKEND_DIR / "data" / "dem"
    dem_name: str = "ldem_75s_120m"

    # Hydrogen map for the landing search, downloaded with `python -m app.scripts.fetch_resources`.
    resources_dir: Path = BACKEND_DIR / "data" / "resources"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
