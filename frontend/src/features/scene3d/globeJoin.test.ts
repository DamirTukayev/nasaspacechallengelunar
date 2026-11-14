import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import type { TerrainResponse } from '../../api/types'
import { createGlobeJoin, edgeBlend, surfaceHeight } from './globeJoin'
import { MOON_RADIUS_KM } from '../mission-control/globe'

describe('terrain joins the rendered globe', () => {
  it('preserves the centre and smoothly removes relief at every outer edge', () => {
    expect(edgeBlend(0, 0, 20, 7)).toBe(1)
    for (const [x, z] of [
      [20, 0],
      [-20, 6],
      [4, 20],
      [20, 20],
    ])
      expect(edgeBlend(x, z, 20, 7)).toBe(0)
    expect(edgeBlend(16.5, 0, 20, 7)).toBeCloseTo(0.5)
    expect(edgeBlend(19.999, 0, 20, 7)).toBeLessThan(0.000001)
  })
  for (const site of [
    { lat: -90, lon: 0 },
    { lat: -89.5, lon: -135.19 },
    { lat: -85.98, lon: -1.67 },
    { lat: 0.674, lon: 23.47 },
  ]) {
    it(`covers the entire patch at ${site.lat}, ${site.lon}, at all quality levels`, () => {
      for (const segments of [48, 96, 128]) {
        const sample = createGlobeJoin(site, 1.3, 20, segments)
        for (let x = -20; x <= 20; x += 5)
          for (let z = -20; z <= 20; z += 5) {
            const point = sample(x, z)
            expect(Number.isFinite(point.height)).toBe(true)
            expect(point.normal.length()).toBeCloseTo(1)
            expect(point.normal.y).toBeGreaterThan(0.99)
            expect(point.height).toBeLessThanOrEqual(
              Math.sqrt(MOON_RADIUS_KM ** 2 - x * x - z * z) - MOON_RADIUS_KM - 1.3 + 0.001,
            )
            expect(point.uv.every(Number.isFinite)).toBe(true)
          }
      }
    })
  }
})

describe('surfaceHeight', () => {
  // A 3 × 3 patch, ±20 km, everywhere 500 m above the site.
  const terrain = {
    kind: 'terrain',
    size: 3,
    half_extent_m: 20_000,
    heights: Array(9).fill(500),
    site_alt_m: 1000,
  } as TerrainResponse
  const join = () => ({
    height: -0.2,
    uv: [0, 0] as [number, number],
    normal: new Vector3(0, 1, 0),
  })

  it('follows the measured heights near the site', () => {
    expect(surfaceHeight(terrain, 0, 0, 1, join)).toBeCloseTo(0.5)
    expect(surfaceHeight(terrain, 0, 0, 2, join)).toBeCloseTo(1)
  })

  it('meets the globe at the edge of the patch, like the drawn terrain', () => {
    expect(surfaceHeight(terrain, 20, 0, 1, join)).toBeCloseTo(-0.2)
    expect(surfaceHeight(terrain, -20, 20, 1, join)).toBeCloseTo(-0.2)
    const halfway = surfaceHeight(terrain, 20 - 0.35 * 20 * 0.5, 0, 1, join)
    expect(halfway).toBeCloseTo((0.5 + -0.2) / 2)
  })

  it('uses the measured heights alone without a globe', () => {
    expect(surfaceHeight(terrain, 20, 0, 1)).toBeCloseTo(0.5)
  })
})
