import { useEffect, useMemo } from 'react'
import { Color, Float32BufferAttribute, PlaneGeometry } from 'three'
import type { NearbyResponse, TerrainResponse } from '../../api/types'
import { type HeatLayer, rampColor, vertexValue, vertexWeights } from './heat'

/** How strongly the sunlight map tints the terrain: enough to read, the relief still shows. */
const HEAT_MIX = 0.72

export interface TerrainHeat {
  /** The grid the values belong to (the /api/nearby grid). */
  grid: Pick<NearbyResponse, 'east_m' | 'north_m'>
  /** One value 0…1 per grid node, row-major; NaN where there is no data. */
  values: Float32Array
  layer: HeatLayer
}

interface Props {
  terrain: TerrainResponse
  exaggeration: number
  /** Tint the terrain with a sunlight / Earth-visibility map (W6). */
  heat?: TerrainHeat | null
}

/** LOLA heights as a lit, shadow-casting surface. Units: km. */
export function TerrainMesh({ terrain, exaggeration, heat }: Props) {
  const { geometry, baseColors } = useMemo(() => {
    const { size, half_extent_m, heights } = terrain
    const extentKm = (2 * half_extent_m) / 1000
    const geo = new PlaneGeometry(extentKm, extentKm, size - 1, size - 1)
    // Lay the plane flat: its +y (top row = north) becomes −z (north in the scene).
    geo.rotateX(-Math.PI / 2)

    const position = geo.getAttribute('position')
    const min = Math.min(...heights)
    const max = Math.max(...heights)
    const low = new Color('#7a7c82')
    const high = new Color('#c8c6bf')
    const colors = new Float32Array(heights.length * 3)
    const color = new Color()

    // PlaneGeometry vertices run row by row from the top-left, like the heights array.
    for (let i = 0; i < heights.length; i++) {
      position.setY(i, (heights[i] / 1000) * exaggeration)
      color.lerpColors(low, high, (heights[i] - min) / (max - min || 1))
      colors.set([color.r, color.g, color.b], i * 3)
    }
    geo.setAttribute('color', new Float32BufferAttribute(colors.slice(), 3))
    geo.computeVertexNormals()
    return { geometry: geo, baseColors: colors }
  }, [terrain, exaggeration])

  const grid = heat?.grid
  const blend = useMemo(
    () => (grid ? vertexWeights(terrain.size, terrain.half_extent_m, grid) : null),
    [terrain.size, terrain.half_extent_m, grid],
  )

  // Recolour on every new set of values (the map grows as the lunar day plays).
  useEffect(() => {
    const attribute = geometry.getAttribute('color') as Float32BufferAttribute
    const colors = attribute.array as Float32Array
    if (!heat || !blend) {
      colors.set(baseColors)
    } else {
      const vertices = baseColors.length / 3
      for (let v = 0; v < vertices; v++) {
        const value = vertexValue(heat.values, blend.nodes, blend.weights, v)
        if (Number.isNaN(value)) {
          colors[v * 3] = baseColors[v * 3]
          colors[v * 3 + 1] = baseColors[v * 3 + 1]
          colors[v * 3 + 2] = baseColors[v * 3 + 2]
          continue
        }
        const [r, g, b] = rampColor(heat.layer, value)
        colors[v * 3] = baseColors[v * 3] * (1 - HEAT_MIX) + r * HEAT_MIX
        colors[v * 3 + 1] = baseColors[v * 3 + 1] * (1 - HEAT_MIX) + g * HEAT_MIX
        colors[v * 3 + 2] = baseColors[v * 3 + 2] * (1 - HEAT_MIX) + b * HEAT_MIX
      }
    }
    attribute.needsUpdate = true
  }, [geometry, baseColors, heat, blend])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}
