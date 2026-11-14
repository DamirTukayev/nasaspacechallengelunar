import { describe, expect, it } from 'vitest'
import type { NearbyResponse, NearbySpot } from '../../api/types'
import { compareSpots } from './spotComparison'
const spot = (both: number, night = 12): NearbySpot => ({
  lat: -89,
  lon: 0,
  site_alt_m: 0,
  both_pct: both,
  sunlit_pct: 80,
  earth_visible_pct: 80,
  longest_dark_hours: night,
  longest_no_earth_hours: 10,
  verdict: 'red',
})
const map = (spots: (NearbySpot | null)[]): NearbyResponse => ({
  center_lat: -89,
  center_lon: 0,
  east_m: [-2000, 0, 2000],
  north_m: [2000, 0, -2000],
  spots,
  best_index: null,
  dem: 'test',
  azimuth_step_deg: 1,
})
const start = '2026-11-14T00:00:00Z',
  end = '2026-11-16T00:00:00Z'
describe('nearby comparison', () => {
  it('ranks covered alternatives and converts percentages into hours over the same interval', () => {
    const result = compareSpots(
      map([spot(30), null, spot(70, 5), null, spot(20, 20), null, null, null, null]),
      [start, end],
    )!
    expect(result.here.index).toBe(4)
    expect(result.best.index).toBe(2)
    expect(result.gainedHours).toBe(24)
    expect(result.shorterNightHours).toBe(15)
    expect(result.distanceKm).toBeCloseTo(Math.sqrt(8))
  })
  it('does not promise improvement for ties or an already optimal original', () => {
    expect(
      compareSpots(map([spot(20), null, null, null, spot(20), null, null, null, null]), [
        start,
        end,
      ]),
    ).toBeNull()
  })
  it('rejects an uncovered original and invalid time ranges', () => {
    const data = map([spot(90), null, null, null, null, null, null, null, null])
    expect(compareSpots(data, [start, end])).toBeNull()
    data.spots[4] = spot(10)
    expect(compareSpots(data, [end, start])).toBeNull()
    expect(compareSpots(data, ['invalid', end])).toBeNull()
  })
  it('preserves a longer-night tradeoff rather than claiming every measure improves', () => {
    const result = compareSpots(
      map([null, spot(60, 30), null, null, spot(20, 10), null, null, null, null]),
      [start, end],
    )!
    expect(result.shorterNightHours).toBe(-20)
  })
  it('breaks equal contact scores by shorter night, then distance', () => {
    const result = compareSpots(
      map([spot(70, 5), spot(70, 5), spot(70, 10), null, spot(20), null, null, null, null]),
      [start, end],
    )!
    expect(result.best.index).toBe(1)
  })
})

it('uses the sampled six hours, not the requested seven-hour range', () => {
  const data = map([spot(70), null, null, null, spot(20), null, null, null, null])
  data.timelines = { samples: 2, sun: [], earth: [] }
  const result = compareSpots(data, [start, '2026-11-14T06:00:00Z'])!
  expect(result.hours).toBe(6)
  expect(result.gainedHours).toBe(3)
  expect(compareSpots(data, [start])).toBeNull()
  data.timelines.samples = 3
  expect(compareSpots(data, [start, end])).toBeNull()
})
