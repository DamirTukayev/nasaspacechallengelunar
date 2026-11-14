import { describe, expect, it } from 'vitest'
import type { NearbyResponse, NearbySpot } from '../../api/types'
import { cells, centerIndex, colorFor, describeOffset, summarize } from './nearby'

const spot = (both: number, sunlit = both): NearbySpot => ({
  lat: -86,
  lon: 0,
  site_alt_m: 0,
  sunlit_pct: sunlit,
  earth_visible_pct: 100,
  both_pct: both,
  longest_dark_hours: 0,
  longest_no_earth_hours: 0,
  verdict: 'red',
})

// 3×3: row 0 is north, column 0 is west.
const MAP: NearbyResponse = {
  center_lat: -86,
  center_lon: 0,
  east_m: [-1000, 0, 1000],
  north_m: [1000, 0, -1000],
  spots: [spot(10), spot(20), spot(30), spot(40, 90), spot(55), null, spot(0), spot(67), spot(5)],
  best_index: 7,
  dem: 'test',
  azimuth_step_deg: 1,
}

describe('colorFor', () => {
  it('runs from the surface at 0% to amber at 100%, clamped', () => {
    expect(colorFor(0)).toBe('#1c2230')
    expect(colorFor(100)).toBe('#f5c542')
    expect(colorFor(-5)).toBe(colorFor(0))
    expect(colorFor(150)).toBe(colorFor(100))
  })

  it('gets lighter as the value grows', () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16)
    expect(lum(colorFor(25))).toBeLessThan(lum(colorFor(50)))
    expect(lum(colorFor(50))).toBeLessThan(lum(colorFor(75)))
  })
})

describe('describeOffset', () => {
  it.each([
    [0, 0, 'here'],
    [-2000, 0, '2 km W'],
    [0, -1000, '1 km S'],
    [3000, 1500, '1.5 km N, 3 km E'],
    [-500, 250, '0.3 km N, 0.5 km W'],
  ])('%s E, %s N → %s', (east, north, expected) => {
    expect(describeOffset(east, north)).toBe(expected)
  })
})

describe('grid', () => {
  it('maps the flat list to rows and columns with their offsets', () => {
    const c = cells(MAP)
    expect(c[0]).toMatchObject({ row: 0, col: 0, eastM: -1000, northM: 1000 })
    expect(c[5]).toMatchObject({ row: 1, col: 2, eastM: 1000, northM: 0, spot: null })
    expect(centerIndex(MAP)).toBe(4)
  })

  it('finds the best spot for the chosen metric, skipping gaps', () => {
    expect(summarize(MAP, 'both_pct').best?.index).toBe(7)
    expect(summarize(MAP, 'sunlit_pct').best?.index).toBe(3)
    expect(summarize(MAP, 'both_pct').here.spot?.both_pct).toBe(55)
  })
})
