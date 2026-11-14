import type { NearbyResponse, NearbySpot } from '../../api/types'

export type NearbyMetric = 'both_pct' | 'sunlit_pct' | 'earth_visible_pct'

export const NEARBY_METRICS: { key: NearbyMetric; label: string }[] = [
  { key: 'both_pct', label: 'Sun + Earth' },
  { key: 'sunlit_pct', label: 'Sunlight' },
  { key: 'earth_visible_pct', label: 'Earth in view' },
]

/**
 * Sequential, one hue: from the panel surface (0%, recedes) to the Sun's amber (100%).
 * Interpolated in linear light so the middle doesn't turn muddy.
 */
const LOW = [0x1c, 0x22, 0x30]
const HIGH = [0xf5, 0xc5, 0x42]

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const toSrgb = (v: number) =>
  Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))

export function colorFor(pct: number): string {
  const t = Math.min(1, Math.max(0, pct / 100))
  const rgb = LOW.map((lo, i) => toSrgb(toLinear(lo) + (toLinear(HIGH[i]) - toLinear(lo)) * t))
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function km(m: number): string {
  const v = Math.abs(m) / 1000
  return `${Number.isInteger(v) ? v : v.toFixed(1)} km`
}

/** "here", "2 km W", "1 km S, 3 km E" — how to walk from the site to a grid node. */
export function describeOffset(eastM: number, northM: number): string {
  const parts: string[] = []
  if (Math.abs(northM) >= 1) parts.push(`${km(northM)} ${northM > 0 ? 'N' : 'S'}`)
  if (Math.abs(eastM) >= 1) parts.push(`${km(eastM)} ${eastM > 0 ? 'E' : 'W'}`)
  return parts.length ? parts.join(', ') : 'here'
}

export interface GridCell {
  index: number
  row: number
  col: number
  eastM: number
  northM: number
  spot: NearbySpot | null
}

export function cells(map: NearbyResponse): GridCell[] {
  const n = map.east_m.length
  return map.spots.map((spot, index) => {
    const row = Math.floor(index / n)
    const col = index % n
    return { index, row, col, eastM: map.east_m[col], northM: map.north_m[row], spot }
  })
}

export function centerIndex(map: NearbyResponse): number {
  const n = map.east_m.length
  return Math.floor(n / 2) * n + Math.floor(n / 2)
}

/** The site itself and the best spot, for the sentence under the map. */
export function summarize(map: NearbyResponse, metric: NearbyMetric) {
  const all = cells(map)
  const here = all[centerIndex(map)]
  const valid = all.filter((c) => c.spot !== null)
  const best = valid.reduce<GridCell | null>(
    (top, c) => (top === null || c.spot![metric] > top.spot![metric] ? c : top),
    null,
  )
  return { here, best }
}
