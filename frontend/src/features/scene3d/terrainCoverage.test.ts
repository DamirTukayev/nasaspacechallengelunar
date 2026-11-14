import { expect, it } from 'vitest'
import { terrainCovered } from './terrainMap'
import type { TerrainResponse } from '../../api/types'

it('does not colour missing DEM cells as measured terrain', () => {
  const terrain = {
    kind: 'terrain',
    size: 3,
    half_extent_m: 10,
    valid: [false, false, false, true, true, true, true, true, true],
  } as TerrainResponse
  expect(terrainCovered(terrain, 0, 10)).toBe(false)
  expect(terrainCovered(terrain, 0, 5)).toBe(false)
  expect(terrainCovered(terrain, 0, 0)).toBe(true)
  expect(terrainCovered(terrain, 0, -5)).toBe(true)
  expect(terrainCovered(terrain, 11, 0)).toBe(false)
})
