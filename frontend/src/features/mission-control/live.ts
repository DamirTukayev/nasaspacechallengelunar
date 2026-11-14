import type { AnalyzeResponse, Window } from '../../api/types'

const HOUR_MS = 3_600_000

export interface LiveMetrics {
  /** Hours of the period played so far. */
  elapsedHours: number
  sunlitPct: number
  earthPct: number
  bothPct: number
  longestDarkHours: number
  longestBothHours: number
}

interface Span {
  start: number
  end: number
}

/** Windows cut to [t0, t] (ms). */
function clip(windows: Window[], t0: number, t: number): Span[] {
  return windows
    .map((w) => ({ start: Math.max(Date.parse(w.start), t0), end: Math.min(Date.parse(w.end), t) }))
    .filter((s) => s.end > s.start)
}

const sumHours = (spans: Span[]) => spans.reduce((h, s) => h + (s.end - s.start), 0) / HOUR_MS

/** Longest stretch in [t0, t] not covered by `spans`, as the backend measures nights. */
function longestGapHours(spans: Span[], t0: number, t: number): number {
  const edges = [t0, ...spans.flatMap((s) => [s.start, s.end]), t]
  let longest = 0
  for (let k = 0; k < edges.length; k += 2) longest = Math.max(longest, edges[k + 1] - edges[k])
  return longest / HOUR_MS
}

/**
 * The same metrics as the analysis, but only over the part of the period played so far
 * (from the first sample up to `tMs`). At the last sample they equal the whole-period values.
 */
export function metricsUntil(analysis: AnalyzeResponse, tMs: number): LiveMetrics {
  const { times } = analysis.series
  const t0 = Date.parse(times[0])
  const t = Math.min(Math.max(tMs, t0), Date.parse(times[times.length - 1]))
  const elapsedHours = (t - t0) / HOUR_MS
  if (elapsedHours <= 0) {
    return {
      elapsedHours: 0,
      sunlitPct: 0,
      earthPct: 0,
      bothPct: 0,
      longestDarkHours: 0,
      longestBothHours: 0,
    }
  }

  const sun = clip(analysis.windows.sun, t0, t)
  const earth = clip(analysis.windows.earth, t0, t)
  const both = clip(analysis.windows.both, t0, t)
  const pct = (spans: Span[]) => (100 * sumHours(spans)) / elapsedHours

  return {
    elapsedHours,
    sunlitPct: pct(sun),
    earthPct: pct(earth),
    bothPct: pct(both),
    longestDarkHours: longestGapHours(sun, t0, t),
    longestBothHours: both.reduce((h, s) => Math.max(h, (s.end - s.start) / HOUR_MS), 0),
  }
}
