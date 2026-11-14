from collections import Counter
from functools import lru_cache
from pathlib import Path

from pydantic import TypeAdapter

from app.schemas.site import Site

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "sites.json"

_sites_adapter = TypeAdapter(list[Site])


def load_catalog(path: Path = CATALOG_PATH) -> list[Site]:
    sites = _sites_adapter.validate_json(path.read_bytes())

    counts = Counter(site.id for site in sites)
    duplicates = [site_id for site_id, count in counts.items() if count > 1]
    if duplicates:
        raise ValueError(f"Duplicate site ids in {path.name}: {sorted(duplicates)}")

    return sites


@lru_cache
def get_sites() -> tuple[Site, ...]:
    return tuple(load_catalog())


def get_site(site_id: str) -> Site | None:
    return next((site for site in get_sites() if site.id == site_id), None)
