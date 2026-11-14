from typing import Literal, Protocol

HorizonKind = Literal["sphere", "terrain"]


class HorizonMask(Protocol):
    """Elevation of the local skyline (degrees) as a function of azimuth (degrees from north)."""

    kind: HorizonKind

    def elevation(self, azimuth_deg: float) -> float: ...


class SphereHorizon:
    """Smooth sphere, no terrain: the skyline is at 0° in every direction."""

    kind: HorizonKind = "sphere"

    def elevation(self, azimuth_deg: float) -> float:
        return 0.0


def horizon_for_site(lat: float, lon: float) -> HorizonMask:
    # Terrain-based masks from LOLA come with B4 (#11); until then the skyline is flat.
    return SphereHorizon()
