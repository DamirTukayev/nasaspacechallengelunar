import type { NearbyResponse } from '../../api/types'
import { cells, centerIndex } from './nearby'

/** Compare the same grid solver and time interval, never grid metrics against a finer skyline. */
export function compareSpots(map: NearbyResponse, times: readonly string[]) {
  if (times.length < 2 || (map.timelines && map.timelines.samples !== times.length)) return null
  const hours = (Date.parse(times[times.length - 1]) - Date.parse(times[0])) / 3_600_000
  const all = cells(map)
  const here = all[centerIndex(map)]
  if (!here?.spot || !Number.isFinite(hours) || hours <= 0) return null
  const candidates = all.filter(
    (c) => c.spot && c.index !== here.index && c.spot.both_pct > here.spot!.both_pct + 0.01,
  )
  candidates.sort(
    (a, b) =>
      b.spot!.both_pct - a.spot!.both_pct ||
      a.spot!.longest_dark_hours - b.spot!.longest_dark_hours ||
      Math.hypot(a.eastM, a.northM) - Math.hypot(b.eastM, b.northM),
  )
  const best = candidates[0]
  if (!best) return null
  return {
    here,
    best,
    hours,
    gainedHours: ((best.spot!.both_pct - here.spot.both_pct) * hours) / 100,
    shorterNightHours: here.spot.longest_dark_hours - best.spot!.longest_dark_hours,
    distanceKm: Math.hypot(best.eastM - here.eastM, best.northM - here.northM) / 1000,
  }
}
export type SpotComparison = NonNullable<ReturnType<typeof compareSpots>>
