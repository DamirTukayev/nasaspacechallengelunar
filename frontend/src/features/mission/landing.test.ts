import { describe, expect, it } from 'vitest'
import {
  type LandingSearch,
  STAGES,
  TOTAL_SECONDS,
  formatLat,
  formatLon,
  makeGridSampler,
  hasLandingSite,
  rampColor,
  scannedCount,
  stageAt,
  sweepFraction,
} from './landing'

/** 3x3 grid (spacing 10 km, radius 10 km) clipped to a disk: the center and 4 neighbours. */
function tinySearch(): LandingSearch {
  const x_km = [0, -10, 0, 10, 0]
  const y_km = [-10, 0, 0, 0, 10]
  const values = [1, 2, 3, 4, 5]
  return {
    radius_km: 10,
    spacing_km: 10,
    points: { x_km, y_km, total: values },
  } as unknown as LandingSearch
}

describe('makeGridSampler', () => {
  const data = tinySearch()
  const sample = makeGridSampler(data)
  const values = data.points.total

  it('returns exact values on grid points', () => {
    expect(sample(values, 0, 0)).toBeCloseTo(3)
    expect(sample(values, 10, 0)).toBeCloseTo(4)
    expect(sample(values, 0, 10)).toBeCloseTo(5)
  })

  it('interpolates between neighbours', () => {
    expect(sample(values, 5, 0)).toBeCloseTo(3.5)
    expect(sample(values, 0, -5)).toBeCloseTo(2)
  })

  it('is null outside the searched disk', () => {
    expect(sample(values, 9, 9)).toBeNull()
  })
})

describe('sweepFraction', () => {
  it('starts at +y and turns toward +x', () => {
    expect(sweepFraction(0, 1)).toBeCloseTo(0)
    expect(sweepFraction(1, 0)).toBeCloseTo(0.25)
    expect(sweepFraction(0, -1)).toBeCloseTo(0.5)
    expect(sweepFraction(-1, 0)).toBeCloseTo(0.75)
  })

  it('counts points behind the sweep', () => {
    expect(scannedCount([0.1, 0.5, 0.9], 0.5)).toBe(2)
    expect(scannedCount([0.1, 0.5, 0.9], 1)).toBe(3)
  })
})

describe('timeline', () => {
  it('lasts about a minute', () => {
    expect(TOTAL_SECONDS).toBe(60)
  })

  it('maps time to stage and progress', () => {
    expect(stageAt(0)).toEqual({ index: 0, progress: 0 })
    expect(stageAt(3).index).toBe(0)
    expect(stageAt(3).progress).toBeCloseTo(0.5)
    expect(stageAt(STAGES[0].seconds).index).toBe(1)
    expect(stageAt(1000)).toEqual({ index: STAGES.length - 1, progress: 1 })
  })
})

describe('formatting and colors', () => {
  it('formats coordinates', () => {
    expect(formatLat(-88.811)).toBe('88.81°S')
    expect(formatLon(123.69)).toBe('123.69°E')
    expect(formatLon(-1.5)).toBe('1.50°W')
  })

  it('ramps from dark indigo to yellow and clamps', () => {
    const low = rampColor(0)
    const high = rampColor(1)
    expect(low[0] + low[1] + low[2]).toBeLessThan(high[0] + high[1] + high[2])
    expect(rampColor(-5)).toEqual(low)
    expect(rampColor(5)).toEqual(high)
  })
})

describe('landing eligibility', () => {
  it('prevents descent when the search has no eligible site', () => {
    const data = { ...tinySearch(), best: null, site_terrain: null }
    expect(hasLandingSite(data)).toBe(false)
  })

  it('rejects an ineligible best index from an older response', () => {
    const data = { ...tinySearch(), best: 0, points: { ...tinySearch().points, eligible: [false] } }
    expect(hasLandingSite(data)).toBe(false)
  })
})
