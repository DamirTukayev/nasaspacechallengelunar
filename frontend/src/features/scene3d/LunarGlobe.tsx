import { globeRotation } from './globeJoin'
import type { LunarTextures } from './useLunarTextures'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import type { Site, TerrainResponse } from '../../api/types'
import { MOON_RADIUS_KM, latLonToGlobe } from '../mission-control/globe'
import { QUALITY, type Quality } from './quality'
import { globePositionToLocal, type LunarSite } from './lunarFrame'
import { SceneLabel } from './SceneLabel'

/** The terrain already includes lunar curvature; cut its footprint out of the base sphere. */
export function LunarGlobe({
  site,
  terrain,
  quality,
  sites,
  overview,
  textures,
}: {
  site: LunarSite
  terrain: TerrainResponse
  quality: Quality
  sites: Site[]
  overview: boolean
  textures: LunarTextures
}) {
  const altitude = (terrain.site_alt_m ?? 0) / 1000
  const center = -MOON_RADIUS_KM - altitude
  const rotation = useMemo(
    () => globeRotation({ lat: site.lat, lon: site.lon }),
    [site.lat, site.lon],
  )
  const half = terrain.half_extent_m / 1000
  const markers = useRef<Group>(null)
  const centerPoint = useMemo(() => new Vector3(0, center, 0), [center])
  useFrame(({ camera }) => {
    if (markers.current)
      markers.current.visible = camera.position.distanceTo(centerPoint) > MOON_RADIUS_KM + 200
  })
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
      <group ref={markers}>
        {overview &&
          sites.map((s) => (
            <mesh
              key={s.id}
              position={globePositionToLocal(latLonToGlobe(s.lat, s.lon), site, altitude)}
            >
              <sphereGeometry args={[s.id === site.siteId ? 12 : 5, 12, 8]} />
              <meshBasicMaterial
                color={s.id === site.siteId ? '#ffd65a' : '#cfe8ff'}
                toneMapped={false}
              />
            </mesh>
          ))}
        {overview && (
          <SceneLabel position={[0, 15, 0]} text={site.name} className="mc-intro-label" />
        )}
      </group>
    </>
  )
}
