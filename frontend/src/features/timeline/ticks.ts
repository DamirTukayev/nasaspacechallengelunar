import { DAY_MS, HOUR_MS } from '../../lib/time'

const STEPS = [
  HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  2 * DAY_MS,
  7 * DAY_MS,
  14 * DAY_MS,
  30 * DAY_MS,
  91 * DAY_MS,
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface Tick {
  ms: number
  label: string
}

/** UTC ticks at round times, about one per `minSpacingPx`. */
export function timeTicks(startMs: number, endMs: number, widthPx: number, minSpacingPx = 72) {
  const maxTicks = Math.max(2, Math.floor(widthPx / minSpacingPx))
  const step = STEPS.find((s) => (endMs - startMs) / s <= maxTicks) ?? STEPS[STEPS.length - 1]
  const withTime = step < DAY_MS

  // Align to UTC midnight for day-or-longer steps, to the hour grid otherwise.
  const align = step >= DAY_MS ? DAY_MS : step
  const ticks: Tick[] = []
  for (let ms = Math.ceil(startMs / align) * align; ms <= endMs; ms += step) {
    const d = new Date(ms)
    const date = `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`
    const time = `${String(d.getUTCHours()).padStart(2, '0')}:00`
    ticks.push({ ms, label: withTime ? (d.getUTCHours() === 0 ? date : time) : date })
  }
  return ticks
}

/** Index of the sample nearest to `ms` in an ascending list of times. */
export function nearestIndex(timesMs: number[], ms: number): number {
  let lo = 0
  let hi = timesMs.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (timesMs[mid] <= ms) lo = mid
    else hi = mid
  }
  return Math.abs(timesMs[hi] - ms) < Math.abs(timesMs[lo] - ms) ? hi : lo
}
