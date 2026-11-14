import type { Window } from '../../api/types'
import { DAY_MS, HOUR_MS } from '../../lib/time'

export interface BodyStatus {
  /** Whether the body is in view at the given moment. */
  up: boolean
  /** The next change: it sets if it is up, rises if it is down. */
  event: 'set' | 'rise'
  /** When the next change happens; null if it does not happen within the range. */
  at: Date | null
  /** Time until `at`, or until the end of the range when `at` is null. */
  msUntil: number
}

/** Where a body stands at `tMs` relative to its visibility windows. */
export function statusAt(windows: Window[], tMs: number, rangeEndMs: number): BodyStatus {
  const toEnd = Math.max(rangeEndMs - tMs, 0)

  // A window still open at the end of the range includes its last sample.
  const current = windows.find((w) => {
    const end = Date.parse(w.end)
    return Date.parse(w.start) <= tMs && (tMs < end || (w.ends_after_range && tMs <= end))
  })
  if (current) {
    if (current.ends_after_range) return { up: true, event: 'set', at: null, msUntil: toEnd }
    const at = new Date(current.end)
    return { up: true, event: 'set', at, msUntil: at.getTime() - tMs }
  }

  const next = windows.find((w) => Date.parse(w.start) > tMs)
  if (next) {
    const at = new Date(next.start)
    return { up: false, event: 'rise', at, msUntil: at.getTime() - tMs }
  }
  return { up: false, event: 'rise', at: null, msUntil: toEnd }
}

/** "3 d 4 h", "5 h 20 min", "12 min", "< 1 min". */
export function formatCountdown(ms: number): string {
  if (ms < 60_000) return '< 1 min'
  const days = Math.floor(ms / DAY_MS)
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((ms % HOUR_MS) / 60_000)
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
  return `${minutes} min`
}
