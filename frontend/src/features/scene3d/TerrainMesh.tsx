import { MOON_RADIUS_KM } from '../mission-control/globe'
import { useEffect, useMemo } from 'react'
import {
  Color,
  DoubleSide,
  FrontSide,
  Float32BufferAttribute,
  PlaneGeometry,
  type Texture,
} from 'three'
import type { TerrainResponse } from '../../api/types'

import { colorFor } from '../nearby/nearby'
import { type TerrainMap, mapValue, terrainHeight } from './terrainMap'

interface Props {
  holeKm?: number
  parent?: TerrainResponse
  texture?: Texture | null
  skirt?: boolean
  stride?: number
  map?: TerrainMap
  terrain: TerrainResponse
  exaggeration: number
}

/** LOLA heights as a lit, shadow-casting surface. Units: km. */
export function TerrainMesh({
  terrain,
  exaggeration,
  map,
  stride = 1,
  skirt = false,
  holeKm = 0,
  parent,
  texture,
}: Props) {
  const mapData = map?.data
  const metric = map?.metric
  const { geometry, baseColors } = useMemo(() => {
    const { size, half_extent_m, heights } = terrain
    const extentKm = (2 * half_extent_m) / 1000
    const segments = Math.max(1, Math.ceil((size - 1) / stride))
    const geo = new PlaneGeometry(extentKm, extentKm, segments, segments)
    // Lay the plane flat: its +y (top row = north) becomes −z (north in the scene).
    geo.rotateX(-Math.PI / 2)

    const position = geo.getAttribute('position')
    const min = heights.reduce((a, b) => Math.min(a, b), Infinity)
    const max = heights.reduce((a, b) => Math.max(a, b), -Infinity)
    const low = new Color('#7a7c82')
    const high = new Color('#c8c6bf')
    const colors = new Float32Array(position.count * 3)
    const color = new Color()

    // PlaneGeometry vertices run row by row from the top-left, like the heights array.
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) * 1000,
        north = -position.getZ(i) * 1000
      let height = terrainHeight(terrain, x, north)
      if (parent) {
        const edge = Math.min(1, (half_extent_m - Math.max(Math.abs(x), Math.abs(north))) / 200)
        height = height * edge + terrainHeight(parent, x, north) * (1 - edge)
      }
      position.setY(i, height * exaggeration)
      color.lerpColors(low, high, (height * 1000 - min) / (max - min || 1))
      colors.set([color.r, color.g, color.b], i * 3)
    }
    if (holeKm > 0) {
      const indices = Array.from(geo.index!.array),
        kept: number[] = []
      for (let i = 0; i < indices.length; i += 3) {
        const triangle = indices.slice(i, i + 3)
        const x = triangle.reduce((v, j) => v + position.getX(j), 0) / 3
        const z = triangle.reduce((v, j) => v + position.getZ(j), 0) / 3
        if (Math.abs(x) >= holeKm || Math.abs(z) >= holeKm) kept.push(...triangle)
      }
      geo.setIndex(kept)
    }
    if (skirt) {
      // A skirt joins the measured patch to the coarse globe mesh at every edge.
      const vertices = Array.from(position.array)
      const shades = Array.from(colors)
      const indices = Array.from(geo.index!.array)
      const edge: number[] = []
      const row = segments + 1
      for (let c = 0; c < segments; c++) edge.push(c)
      for (let r = 0; r < segments; r++) edge.push(r * row + segments)
      for (let c = segments; c > 0; c--) edge.push(segments * row + c)
      for (let r = segments; r > 0; r--) edge.push(r * row)
      const base = position.count
      edge.forEach((i) => {
        vertices.push(position.getX(i), position.getY(i) - 30, position.getZ(i))
        shades.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2])
      })
      const top = base + edge.length
      edge.forEach((i) => {
        const x = position.getX(i),
          z = position.getZ(i)
        const sphereHeight =
          Math.sqrt(MOON_RADIUS_KM ** 2 - x * x - z * z) -
          MOON_RADIUS_KM -
          (terrain.site_alt_m ?? 0) / 1000
        vertices.push(x, Math.max(position.getY(i), sphereHeight + 0.02), z)
        shades.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2])
      })
      edge.forEach((_, i) => {
        const next = (i + 1) % edge.length
        indices.push(top + i, base + i, top + next, top + next, base + i, base + next)
      })
      geo.setAttribute('position', new Float32BufferAttribute(vertices, 3))
      geo.setAttribute('color', new Float32BufferAttribute(shades, 3))
      geo.setIndex(indices)
    } else geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return { geometry: geo, baseColors: new Float32Array(geo.getAttribute('color').array) }
  }, [terrain, exaggeration, stride, skirt, holeKm, parent])
  const values = map?.values
  useEffect(() => {
    const attribute = geometry.getAttribute('color') as Float32BufferAttribute
    const colors = attribute.array as Float32Array
    colors.set(baseColors)
    if (mapData && metric) {
      const positions = geometry.getAttribute('position'),
        tint = new Color()
      for (let i = 0; i < positions.count; i++) {
        const value = mapValue(
          mapData,
          metric,
          positions.getX(i) * 1000,
          -positions.getZ(i) * 1000,
          values,
        )
        if (value !== null) {
          tint.set(colorFor(value))
          colors.set([tint.r, tint.g, tint.b], i * 3)
        }
      }
    }
    attribute.needsUpdate = true
  }, [geometry, baseColors, mapData, metric, values])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        key={texture ? 'imagery' : 'lighting'}
        map={texture ?? null}
        vertexColors={!texture}
        roughness={1}
        metalness={0}
        side={skirt ? DoubleSide : FrontSide}
      />
    </mesh>
  )
}
