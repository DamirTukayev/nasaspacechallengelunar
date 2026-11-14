import { describe, expect, it } from 'vitest'
import type { HorizonResponse } from '../../api/types'
import { blockerAt, compassPoint, describeSight, sightOf } from './sight'

/** A skyline every 90°: a 1 km-high ridge 10 km to the north, open elsewhere. */
const horizon: HorizonResponse = {
  kind: 'terrain',
  azimuths: [0, 90, 180, 270],
  elevations: [5.7, 0.5, -0.3, 0.2],
  site_alt_m: 1000,
  observer_height_m: 2,
  dem: 'test',
  hits: {
    distance_m: [10_000, 200, 50_000, null],
    height_m: [2000, 1002, 800, null],
    lat: [-88, -88, -88, null],
    lon: [0, 0, 0, null],
  },
  rays: 4,
  terrain_samples: 1000,
}

describe('compassPoint', () => {
  it.each([
    [0, 'N'],
    [44, 'NE'],
    [206, 'SSW'],
    [225, 'SW'],
    [359, 'N'],
    [-90, 'W'],
  ])('%f° → %s', (az, point) => {
    expect(compassPoint(az)).toBe(point)
  })
})

describe('blockerAt', () => {
  it('places the ridge north of the site, raised and curved down', () => {
    const b = blockerAt(horizon, 3)!
    expect(b.bearing).toBe('N')
    expect(b.distanceKm).toBe(10)
    expect(b.heightAboveSiteM).toBe(1000)
    expect(b.position[0]).toBeCloseTo(0)
    expect(b.position[2]).toBeCloseTo(-10) // north is −z
    // 1 km up, minus the 10² / 2R ≈ 0.029 km curvature drop
    expect(b.position[1]).toBeCloseTo(1 - 100 / (2 * 1737.4), 4)
  })

  it('scales the height with the relief exaggeration', () => {
    expect(blockerAt(horizon, 0, 2)!.position[1]).toBeCloseTo(
      2 * blockerAt(horizon, 0)!.position[1],
    )
  })

  it('wraps azimuths and returns null where the ray left the DEM', () => {
    expect(blockerAt(horizon, 359)!.bearing).toBe('N')
    expect(blockerAt(horizon, 270)).toBeNull()
  })

  it('needs hit points and a site height', () => {
    expect(blockerAt({ ...horizon, hits: null }, 0)).toBeNull()
    expect(blockerAt({ ...horizon, site_alt_m: null }, 0)).toBeNull()
  })
})

describe('sightOf', () => {
  it('is visible when the analysis says so', () => {
    expect(sightOf(0, 10, true, 5.7, horizon).kind).toBe('visible')
  })

  it('is blocked by terrain when just below the skyline', () => {
    const s = sightOf(0, 3, false, 5.7, horizon)
    expect(s.kind).toBe('blocked')
    expect(s.kind === 'blocked' && s.blocker?.distanceKm).toBe(10)
  })

  it('is below the horizon when far below it', () => {
    expect(sightOf(0, -30, false, 5.7, horizon)).toEqual({ kind: 'below', elevationDeg: -30 })
  })

  it('still reports a blocked sight without terrain data', () => {
    const s = sightOf(0, 3, false, 5.7, undefined)
    expect(s.kind === 'blocked' && s.blocker).toBeNull()
  })
})

describe('describeSight', () => {
  it('names the distance, direction and skyline', () => {
    expect(describeSight(sightOf(0, 3, false, 5.7, horizon))).toBe(
      'Hidden by terrain 10 km N (skyline +5.7°)',
    )
    expect(describeSight(sightOf(90, 0, false, 0.5, horizon))).toBe(
      'Hidden by terrain 200 m E (skyline +0.5°)',
    )
  })

  it('reports a partly visible Sun and a clear sight', () => {
    expect(describeSight(sightOf(0, 6, true, 5.7, horizon, 0.42))).toBe(
      'Partly above the skyline: 42% of the disk',
    )
    expect(describeSight(sightOf(0, 20, true, 5.7, horizon))).toBe('Clear line of sight')
  })

  it('reports night', () => {
    expect(describeSight(sightOf(0, -30, false, 5.7, horizon))).toBe('Below the horizon (-30°)')
  })
})
