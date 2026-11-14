import { SceneLabel } from './SceneLabel'
import type { TerrainResponse } from '../../api/types'
import { describeOffset } from '../nearby/nearby'
import { type TerrainMap, terrainHeight } from './terrainMap'

export function TerrainMapMarker({
  map,
  terrain,
  exaggeration,
}: {
  map: TerrainMap
  terrain: TerrainResponse
  exaggeration: number
}) {
  const { data, metric, selected } = map
  const spot = data.spots[selected]
  if (!spot) return null
  const east = data.east_m[selected % data.east_m.length]
  const north = data.north_m[Math.floor(selected / data.east_m.length)]
  return (
    <group
      position={[
        east / 1000,
        terrainHeight(terrain, east, north) * exaggeration + 0.12,
        -north / 1000,
      ]}
    >
      <mesh>
        <sphereGeometry args={[0.08, 12, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <SceneLabel
        position={[0, 0.45, 0]}
        className="mc-map-label"
        text={`${describeOffset(east, north)} · ${(map.values ? map.values[selected] * 100 : spot[metric]).toFixed(1)}%`}
      />
    </group>
  )
}
