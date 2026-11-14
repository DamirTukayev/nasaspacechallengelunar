import { useMemo } from 'react'
import type { TerrainResponse } from '../../api/types'
import { type GlobeJoin, createGlobeJoin } from './globeJoin'
import { QUALITY, type Quality } from './quality'

/** How the measured patch meets the globe mesh; shared by the terrain and what stands on it. */
export function useGlobeJoin(
  terrain: TerrainResponse,
  site: { lat: number; lon: number } | undefined,
  quality: Quality,
): GlobeJoin | undefined {
  const siteLat = site?.lat,
    siteLon = site?.lon
  return useMemo(
    () =>
      siteLat != null && siteLon != null
        ? createGlobeJoin(
            { lat: siteLat, lon: siteLon },
            (terrain.site_alt_m ?? 0) / 1000,
            terrain.half_extent_m / 1000,
            QUALITY[quality].globeSegments,
          )
        : undefined,
    [siteLat, siteLon, terrain.site_alt_m, terrain.half_extent_m, quality],
  )
}
