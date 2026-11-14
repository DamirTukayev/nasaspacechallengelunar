import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useQuery } from '@tanstack/react-query'
import { api, API_URL } from '../../api/client'
import type { TerrainResponse } from '../../api/types'
import type { TerrainMap } from './terrainMap'
import type { Quality } from './quality'
import { QUALITY } from './quality'
import { TerrainMesh } from './TerrainMesh'
import { useSurfaceTexture } from './useSurfaceTexture'

import { detailLevel } from './detailLevel'

export function TerrainLayers({
  terrain,
  quality,
  exaggeration,
  map,
  skirt,
  imagery,
}: {
  terrain: TerrainResponse
  quality: Quality
  exaggeration: number
  map?: TerrainMap
  skirt: boolean
  imagery: boolean
}) {
  const [extent, setExtent] = useState(0)
  useFrame(({ camera }) => {
    const next = quality === 'low' ? 0 : detailLevel(camera.position.length(), extent)
    if (next !== extent) setExtent(next)
  })
  const { lat, lon } = terrain
  const enabled = extent > 0 && lat != null && lon != null && terrain.kind === 'terrain'
  const detail = useQuery({
    queryKey: ['terrain-detail', lat, lon, extent],
    queryFn: () => api.terrain(lat!, lon!, extent),
    enabled,
    staleTime: Infinity,
    retry: false,
  })
  const fine = enabled ? detail.data : undefined
  const texture = useSurfaceTexture(
    fine && imagery && (fine.source_resolution_m ?? 120) < 10
      ? `${API_URL}/api/surface/ortho?lat=${lat}&lon=${lon}&half_extent_km=${extent}`
      : null,
  )
  return (
    <>
      <TerrainMesh
        terrain={terrain}
        exaggeration={exaggeration}
        map={imagery ? undefined : map}
        stride={fine ? 1 : QUALITY[quality].terrainStride}
        skirt={skirt}
        holeKm={fine ? extent : 0}
      />
      {fine && (
        <TerrainMesh
          terrain={fine}
          parent={terrain}
          exaggeration={exaggeration}
          map={imagery ? undefined : map}
          texture={texture}
        />
      )}
    </>
  )
}
