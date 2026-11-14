from fastapi import APIRouter, HTTPException

from app.schemas.site import Site
from app.services.site_catalog import get_site, get_sites

router = APIRouter(prefix="/api/sites", tags=["sites"])


@router.get("", response_model=list[Site])
def list_sites() -> list[Site]:
    return list(get_sites())


@router.get("/{site_id}", response_model=Site)
def read_site(site_id: str) -> Site:
    site = get_site(site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found")
    return site
