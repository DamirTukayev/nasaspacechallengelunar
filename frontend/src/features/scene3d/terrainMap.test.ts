import { describe, expect, it } from 'vitest'
import type { NearbyResponse, NearbySpot } from '../../api/types'
import { mapValue, terrainHeight } from './terrainMap'
const spot = (sun: number, earth = 100 - sun) =>
  ({ sunlit_pct: sun, earth_visible_pct: earth }) as NearbySpot
const map = {
  east_m: [-1000, 0, 1000],
  north_m: [1000, 0, -1000],
  spots: [spot(0), spot(20), spot(40), spot(20), spot(40), spot(60), spot(40), spot(60), spot(80)],
} as NearbyResponse

describe('terrain map', () => {
  it('matches every backend node exactly in both metrics, including edges', () => {
    map.spots.forEach((s, i) => {
      for (const metric of ['sunlit_pct', 'earth_visible_pct'] as const)
        expect(mapValue(map, metric, map.east_m[i % 3], map.north_m[Math.floor(i / 3)])).toBe(
          s![metric],
        )
    })
  })
  it('interpolates north/east correctly and never extrapolates beyond the map', () => {
    expect(mapValue(map, 'sunlit_pct', -500, 500)).toBe(20)
    expect(mapValue(map, 'sunlit_pct', 1001, 0)).toBeNull()
    expect(mapValue(map, 'sunlit_pct', 0, -1001)).toBeNull()
  })
  it('leaves missing cells uncoloured but preserves a valid exact neighbour', () => {
    const missing = { ...map, spots: [null, ...map.spots.slice(1)] }
    expect(mapValue(missing, 'sunlit_pct', -500, 500)).toBeNull()
    expect(mapValue(missing, 'sunlit_pct', 0, 1000)).toBe(20)
  })
  it('drapes the marker on row-zero-north terrain in kilometres', () => {
    const terrain = {
      kind: 'terrain',
      size: 2,
      half_extent_m: 1000,
      heights: [100, 200, 300, 400],
      site_alt_m: 0,
      dem: 'test',
    } as const
    expect(terrainHeight({ ...terrain, heights: [...terrain.heights] }, -1000, 1000)).toBe(0.1)
    expect(terrainHeight({ ...terrain, heights: [...terrain.heights] }, 0, 0)).toBe(0.25)
  })
})
