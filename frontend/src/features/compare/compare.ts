import type { AnalyzeResponse } from '../../api/types'
import { formatDuration } from '../../lib/time'

type Metrics = AnalyzeResponse['metrics']

export interface MetricRow {
  key: string
  label: string
  hint: string
  /** Which direction is better for a mission. */
  better: 'high' | 'low'
  value: (m: Metrics) => number
  format: (value: number) => string
}

const pct = (v: number) => `${v.toFixed(0)}%`

export const METRIC_ROWS: MetricRow[] = [
  {
    key: 'sunlit',
    label: 'Sunlight',
    hint: 'Share of time with the Sun above the skyline',
    better: 'high',
    value: (m) => m.sunlit_pct,
    format: pct,
  },
  {
    key: 'earth',
    label: 'Earth in view',
    hint: 'Share of time with a direct line of sight to the Earth',
    better: 'high',
    value: (m) => m.earth_visible_pct,
    format: pct,
  },
  {
    key: 'both',
    label: 'Sun + Earth',
    hint: 'Share of time with power and a direct link together',
    better: 'high',
    value: (m) => m.both_pct,
    format: pct,
  },
  {
    key: 'longestBoth',
    label: 'Longest Sun + Earth',
    hint: 'Longest stretch with power and a direct link together; a lunar-day mission needs ~10 d',
    better: 'high',
    value: (m) => m.longest_both_hours ?? 0,
    format: formatDuration,
  },
  {
    key: 'dark',
    label: 'Longest darkness',
    hint: 'Longest stretch without the Sun',
    better: 'low',
    value: (m) => m.longest_dark_hours,
    format: formatDuration,
  },
  {
    key: 'noEarth',
    label: 'Longest without Earth',
    hint: 'Longest stretch without a direct link',
    better: 'low',
    value: (m) => m.longest_no_earth_hours,
    format: formatDuration,
  },
  {
    key: 'maxSun',
    label: 'Highest Sun',
    hint: 'Highest solar elevation in the range',
    better: 'high',
    value: (m) => m.max_sun_el,
    format: (v) => `${v.toFixed(1)}°`,
  },
]

/** Values within this distance of the best count as best too (avoids "winning" by noise). */
const TOLERANCE = 0.5

/**
 * Indices of the best values. Empty when fewer than two values are known or when they are
 * all practically equal, so nothing gets highlighted for no reason.
 *
 * With `format`, values that read the same on screen are equal too: "13.3 d" must not beat
 * "13.3 d" because one is 13.33 h and the other 13.27 h underneath.
 */
export function bestIndices(
  values: (number | null)[],
  better: 'high' | 'low',
  format?: (v: number) => string,
): Set<number> {
  const known = values.filter((v): v is number => v !== null)
  if (known.length < 2) return new Set()

  const best = better === 'high' ? Math.max(...known) : Math.min(...known)
  const worst = better === 'high' ? Math.min(...known) : Math.max(...known)
  const same = (a: number, b: number) =>
    Math.abs(a - b) <= TOLERANCE || (format !== undefined && format(a) === format(b))
  if (same(best, worst)) return new Set()

  const result = new Set<number>()
  values.forEach((v, i) => {
    if (v !== null && same(v, best)) result.add(i)
  })
  return result
}

const VERDICT_RANK = { green: 0, yellow: 1, red: 2 } as const

/** Indices of the scenarios with the best verdict, if the verdicts differ. */
export function bestVerdicts(verdicts: (Metrics['verdict'] | null)[]): Set<number> {
  const ranks = verdicts.map((v) => (v === null ? null : -VERDICT_RANK[v]))
  const known = ranks.filter((r): r is number => r !== null)
  if (known.length < 2 || Math.max(...known) === Math.min(...known)) return new Set()
  const top = Math.max(...known)
  return new Set(ranks.flatMap((r, i) => (r === top ? [i] : [])))
}
