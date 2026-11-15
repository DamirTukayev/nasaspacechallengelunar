import { API_URL, USE_MOCKS } from '../../api/client'

/** Response of GET /api/landing-search (also saved as public/data/landing-search.json). */
export type LandingSearch = {
  period_start: string
  period_end: string
  step_minutes: number
  radius_km: number
  spacing_km: number
  weights: Record<ScoreKey, number>
  thresholds: { max_slope_deg: number; min_sunlit_pct: number }
  points: {
    x_km: number[]
    y_km: number[]
    lat: number[]
    lon: number[]
    alt_m: number[]
    slope_deg: number[]
    sunlit_pct: number[]
    longest_dark_h: number[]
    earth_pct: number[]
    hydrogen_ppm: number[]
    cold_trap: boolean[]
    cold_trap_km: number[]
    score_terrain: number[]
    score_light: number[]
    score_comm: number[]
    score_resources: number[]
    total: number[]
    eligible: boolean[]
  }
  best: number | null
  ranking: number[]
  terrain: Heightmap
  site_terrain: (Heightmap & { center_x_km: number; center_y_km: number }) | null
  sources: { name: string; url: string }[]
}

export type SelectedLandingSearch = LandingSearch & {
  best: number
  site_terrain: NonNullable<LandingSearch['site_terrain']>
}

export function hasLandingSite(data: LandingSearch): data is SelectedLandingSearch {
  return (
    data.best !== null && data.points.eligible[data.best] === true && data.site_terrain !== null
  )
}

export type Heightmap = {
  size: number
  half_size_km: number
  cell_m: number
  heights_m: number[]
}

export type ScoreKey = 'terrain' | 'light' | 'comm' | 'resources'
export type FieldKey = ScoreKey | 'total'
export type DataSource = 'live' | 'precomputed'

export type LandingRequest = {
  start: string
  end: string
  stepMinutes: number
  radiusKm: number
  spacingKm: number
}

export function landingQuery(request?: LandingRequest): string {
  if (!request) return ''
  return `?${new URLSearchParams({
    start: request.start,
    end: request.end,
    step_minutes: String(request.stepMinutes),
    radius_km: String(request.radiusKm),
    spacing_km: String(request.spacingKm),
  })}`
}

export function matchesLandingRequest(data: LandingSearch, request?: LandingRequest): boolean {
  return (
    !request ||
    (Date.parse(data.period_start) === Date.parse(request.start) &&
      Date.parse(data.period_end) === Date.parse(request.end) &&
      data.step_minutes === request.stepMinutes &&
      data.radius_km === request.radiusKm &&
      data.spacing_km === request.spacingKm)
  )
}

export const STATIC_URL = `${import.meta.env.BASE_URL}data/landing-search.json`
const LIVE_TIMEOUT_MS = 90_000

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return (await response.json()) as T
}

/** A labelled starting example, without launching a regional calculation on page entry. */
export async function loadSavedLandingSearch(
  signal?: AbortSignal,
): Promise<{ data: LandingSearch; source: DataSource }> {
  return { data: await fetchJson<LandingSearch>(STATIC_URL, signal), source: 'precomputed' }
}

/**
 * Live search on the backend when it is reachable; otherwise the result precomputed with
 * `python -m app.scripts.precompute_landing` on the same data.
 */
export async function loadLandingSearch(
  request?: LandingRequest,
  signal?: AbortSignal,
): Promise<{ data: LandingSearch; source: DataSource }> {
  if (!USE_MOCKS) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS)
    try {
      const data = await fetchJson<LandingSearch>(
        `${API_URL}/api/landing-search${landingQuery(request)}`,
        controller.signal,
      )
      return { data, source: 'live' }
    } catch {
      if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError')
      // Backend down, no data on it, or too slow: fall through to the static copy.
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  return loadSavedLandingSearch(signal)
}

export function fieldValues(data: LandingSearch, field: FieldKey): number[] {
  return field === 'total' ? data.points.total : data.points[`score_${field}`]
}

/** Fraction of a full turn (0..1) of the scan sweep at which a point is reached. */
export function sweepFraction(xKm: number, yKm: number): number {
  // Start at 0°E (+y) and turn clockwise toward 90°E (+x), like a radar.
  const angle = Math.atan2(xKm, yKm)
  return (angle < 0 ? angle + 2 * Math.PI : angle) / (2 * Math.PI)
}

/**
 * Bilinear sample of a per-point field on the regular search grid at (x, y) km.
 * Returns null outside the searched disk.
 */
export function makeGridSampler(data: LandingSearch) {
  const { x_km, y_km } = data.points
  const step = data.spacing_km
  const n = Math.round(data.radius_km / step)
  const width = 2 * n + 1
  const index = new Int32Array(width * width).fill(-1)
  for (let i = 0; i < x_km.length; i++) {
    const col = Math.round(x_km[i] / step) + n
    const row = Math.round(y_km[i] / step) + n
    index[row * width + col] = i
  }

  return (values: ArrayLike<number>, xKm: number, yKm: number): number | null => {
    if (Math.hypot(xKm, yKm) > data.radius_km) return null
    const fc = xKm / step + n
    const fr = yKm / step + n
    const c0 = Math.floor(fc)
    const r0 = Math.floor(fr)
    let sum = 0
    let weight = 0
    for (const [dr, dc] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      const r = r0 + dr
      const c = c0 + dc
      if (r < 0 || c < 0 || r >= width || c >= width) continue
      const i = index[r * width + c]
      if (i < 0) continue
      const w = (1 - Math.abs(fr - r)) * (1 - Math.abs(fc - c))
      sum += values[i] * w
      weight += w
    }
    return weight > 1e-6 ? sum / weight : null
  }
}

// Score ramp in the Noctis palette: night indigo → violet → magenta → coral → badge yellow.
const RAMP: [number, number, number][] = [
  [0x1b, 0x11, 0x45],
  [0x5b, 0x2a, 0x9b],
  [0xb0, 0x40, 0x8f],
  [0xff, 0x7a, 0x5c],
  [0xff, 0xd3, 0x4d],
]

export function rampColor(value: number): [number, number, number] {
  const v = Math.min(1, Math.max(0, value)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(v))
  const t = v - i
  return [0, 1, 2].map((k) => (RAMP[i][k] + (RAMP[i + 1][k] - RAMP[i][k]) * t) / 255) as [
    number,
    number,
    number,
  ]
}

export function rampCss(value: number): string {
  const [r, g, b] = rampColor(value)
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`
}

// --- timeline -------------------------------------------------------------------------------

export type StageId =
  'focus' | 'terrain' | 'light' | 'comm' | 'resources' | 'select' | 'landing' | 'flag'

export type Stage = {
  id: StageId
  label: string
  detail: string
  seconds: number
  field?: FieldKey
}

export const STAGES: Stage[] = [
  {
    id: 'focus',
    label: 'Targeting the Moon',
    detail: 'Lunar south pole, 80 km radius',
    seconds: 6,
  },
  {
    id: 'terrain',
    label: 'Terrain & slope',
    detail: 'LRO LOLA elevation, 120 m/px',
    seconds: 8,
    field: 'terrain',
  },
  {
    id: 'light',
    label: 'Illumination',
    detail: 'Sun above the local skyline, 1 year',
    seconds: 8,
    field: 'light',
  },
  {
    id: 'comm',
    label: 'Earth link',
    detail: 'Earth above the local skyline, 1 year',
    seconds: 8,
    field: 'comm',
  },
  {
    id: 'resources',
    label: 'Resources',
    detail: 'Hydrogen (water ice) and cold traps',
    seconds: 8,
    field: 'resources',
  },
  {
    id: 'select',
    label: 'Optimal site',
    detail: 'Weighted score, safety limits',
    seconds: 7,
    field: 'total',
  },
  { id: 'landing', label: 'Lander descent', detail: 'Powered descent to touchdown', seconds: 9 },
  { id: 'flag', label: 'Flag planted', detail: 'Mission complete', seconds: 6 },
]

export const TOTAL_SECONDS = STAGES.reduce((sum, s) => sum + s.seconds, 0)

/** Stage index and progress (0..1) inside it at time t seconds since start. */
export function stageAt(t: number): { index: number; progress: number } {
  let start = 0
  for (let i = 0; i < STAGES.length; i++) {
    const end = start + STAGES[i].seconds
    if (t < end) return { index: i, progress: Math.max(0, (t - start) / STAGES[i].seconds) }
    start = end
  }
  return { index: STAGES.length - 1, progress: 1 }
}

/** Indices of points already passed by a sweep that has covered `fraction` of a turn. */
export function scannedCount(fractions: number[], fraction: number): number {
  let count = 0
  for (const f of fractions) if (f <= fraction) count++
  return count
}

export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}`
}

export function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`
}
