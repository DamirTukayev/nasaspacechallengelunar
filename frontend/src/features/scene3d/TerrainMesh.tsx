import { edgeBlend, type GlobeJoin } from './globeJoin'
import type { LunarTextures } from './useLunarTextures'
import { useEffect, useMemo } from 'react'
import {
  Color,
  FrontSide,
  Float32BufferAttribute,
  PlaneGeometry,
  ShaderChunk,
  Vector3,
  type Texture,
} from 'three'
import type { TerrainResponse } from '../../api/types'

import { colorFor } from '../nearby/nearby'
import { type TerrainMap, mapValue, terrainHeight } from './terrainMap'

interface Props {
  holeKm?: number
  parent?: TerrainResponse
  texture?: Texture | null
  join?: GlobeJoin
  lunarTextures?: LunarTextures
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
  join,
  lunarTextures,
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
    const colorHeights = parent?.heights ?? heights
    const min = colorHeights.reduce((a, b) => Math.min(a, b), Infinity)
    const max = colorHeights.reduce((a, b) => Math.max(a, b), -Infinity)
    const low = new Color('#7a7c82')
    const high = new Color('#c8c6bf')
    const colors = new Float32Array(position.count * 3)
    const color = new Color()
    const blend = new Float32Array(position.count)
    const joinNormals: Vector3[] = []
    const uv = geo.getAttribute('uv')
    geo.setAttribute('detailUv', uv.clone())
    const outerHalf = (parent ?? terrain).half_extent_m / 1000

    // PlaneGeometry vertices run row by row from the top-left, like the heights array.
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) * 1000,
        north = -position.getZ(i) * 1000
      let height = terrainHeight(terrain, x, north)
      if (parent) {
        const edge = Math.min(1, (half_extent_m - Math.max(Math.abs(x), Math.abs(north))) / 200)
        height = height * edge + terrainHeight(parent, x, north) * (1 - edge)
      }
      const colorHeight = height
      const xKm = x / 1000,
        zKm = -north / 1000
      const weight = join ? edgeBlend(xKm, zKm, outerHalf, outerHalf * 0.35) : 1
      blend[i] = weight
      if (join) {
        const surface = join(xKm, zKm)
        height = (surface.height * (1 - weight) + height * exaggeration * weight) / exaggeration
        uv.setXY(i, ...surface.uv)
        joinNormals.push(surface.normal)
      }
      position.setY(i, height * exaggeration)
      color.lerpColors(
        low,
        high,
        Math.max(0, Math.min(1, (colorHeight * 1000 - min) / (max - min || 1))),
      )
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
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geo.setAttribute('terrainBlend', new Float32BufferAttribute(blend, 1))
    geo.computeVertexNormals()
    if (join) {
      const normals = geo.getAttribute('normal'),
        normal = new Vector3()
      for (let i = 0; i < position.count; i++) {
        normal
          .fromBufferAttribute(normals, i)
          .lerp(joinNormals[i], 1 - blend[i])
          .normalize()
        normals.setXYZ(i, normal.x, normal.y, normal.z)
      }
    }
    return { geometry: geo, baseColors: new Float32Array(geo.getAttribute('color').array) }
  }, [terrain, exaggeration, stride, join, holeKm, parent])
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
        key={`${Boolean(lunarTextures)}-${Boolean(texture)}`}
        map={lunarTextures?.color ?? texture ?? null}
        bumpMap={lunarTextures?.relief ?? null}
        bumpScale={2}
        vertexColors={Boolean(lunarTextures) || !texture}
        customProgramCacheKey={() => `terrain-join-${Boolean(lunarTextures)}-${Boolean(texture)}`}
        onBeforeCompile={(shader) => {
          if (!lunarTextures) return
          shader.vertexShader =
            'attribute float terrainBlend; attribute vec2 detailUv; varying float vTerrainBlend; varying vec2 vDetailUv;\n' +
            shader.vertexShader
          shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            'vTerrainBlend = terrainBlend; vDetailUv = detailUv;\n#include <project_vertex>',
          )
          shader.fragmentShader =
            'varying float vTerrainBlend; varying vec2 vDetailUv; uniform sampler2D detailTexture;\n' +
            shader.fragmentShader
          shader.uniforms.detailTexture = { value: texture ?? lunarTextures.color }
          const photo = texture
            ? `
            vec4 photo = texture2D(detailTexture, vDetailUv);
            float distanceToEdge = min(min(vDetailUv.x, 1.0-vDetailUv.x), min(vDetailUv.y, 1.0-vDetailUv.y));
            float photoBlend = smoothstep(0.0, 0.12, distanceToEdge) * photo.a;
            diffuseColor.rgb = mix(diffuseColor.rgb, photo.rgb, photoBlend);
          `
            : ''
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            diffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb, vTerrainBlend);
            ${photo}
          `,
          )
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            ShaderChunk.normal_fragment_maps.replace(
              'dHdxy_fwd()',
              'dHdxy_fwd() * (1.0 - vTerrainBlend)',
            ),
          )
        }}
        roughness={1}
        metalness={0}
        side={FrontSide}
      />
    </mesh>
  )
}
