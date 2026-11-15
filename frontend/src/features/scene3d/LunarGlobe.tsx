import { globeRotation } from './globeJoin'
import type { LunarTextures } from './useLunarTextures'
import { useMemo } from 'react'
import type { Site, TerrainResponse } from '../../api/types'
import { MOON_RADIUS_KM } from '../mission-control/globe'
import { QUALITY, type Quality } from './quality'
import type { LunarSite } from './lunarFrame'
import { GlobeSiteMarkers } from './GlobeSiteMarkers'

/** The terrain already includes lunar curvature; cut its footprint out of the base sphere. */
export function LunarGlobe({
  site,
  terrain,
  quality,
  sites,
  overview,
  textures,
  onPickSite,
}: {
  site: LunarSite
  terrain: TerrainResponse
  quality: Quality
  sites: Site[]
  overview: boolean
  textures: LunarTextures
  onPickSite?: (siteId: string) => void
}) {
  const altitude = (terrain.site_alt_m ?? 0) / 1000
  const center = -MOON_RADIUS_KM - altitude
  const rotation = useMemo(
    () => globeRotation({ lat: site.lat, lon: site.lon }),
    [site.lat, site.lon],
  )
  const half = terrain.half_extent_m / 1000
  return (
    <>
      <mesh position={[0, center, 0]} quaternion={rotation}>
        <sphereGeometry
          args={[
            MOON_RADIUS_KM,
            QUALITY[quality].globeSegments,
            QUALITY[quality].globeSegments / 2,
          ]}
        />
        <meshStandardMaterial
          map={textures.color}
          bumpMap={textures.relief}
          bumpScale={2}
          roughness={1}
          customProgramCacheKey={() => `lunar-patch-${half}-${center}`}
          onBeforeCompile={(shader) => {
            shader.vertexShader = 'varying vec3 lunarPosition;\n' + shader.vertexShader
            shader.vertexShader = shader.vertexShader.replace(
              '#include <project_vertex>',
              'lunarPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>',
            )
            shader.fragmentShader = 'varying vec3 lunarPosition;\n' + shader.fragmentShader
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <clipping_planes_fragment>',
              `#include <clipping_planes_fragment>\nif (abs(lunarPosition.x) < ${half.toFixed(6)} && abs(lunarPosition.z) < ${half.toFixed(6)} && lunarPosition.y > ${center.toFixed(6)}) discard;`,
            )
          }}
        />
      </mesh>
      {overview && (
        <GlobeSiteMarkers site={site} sites={sites} altitude={altitude} onPickSite={onPickSite} />
      )}
    </>
  )
}
