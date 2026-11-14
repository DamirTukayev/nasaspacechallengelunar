import { useMemo } from 'react'
import { Color, Float32BufferAttribute, PlaneGeometry } from 'three'
import type { TerrainResponse } from '../../api/types'

interface Props {
  terrain: TerrainResponse
  exaggeration: number
}

/** LOLA heights as a lit, shadow-casting surface. Units: km. */
export function TerrainMesh({ terrain, exaggeration }: Props) {
  const geometry = useMemo(() => {
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
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [terrain, exaggeration])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}
