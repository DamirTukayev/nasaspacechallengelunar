// Draft API contract — see docs/mvp-plan.md. Keep in sync with the backend.

export interface HealthResponse {
  status: string
  version: string
}

export type SiteGroup = 'Apollo' | 'CLPS' | 'International' | 'South Pole'

/** Planetocentric Mean Earth/Polar Axis coordinates, east-positive longitude. */
export interface Site {
  id: string
  name: string
  group: SiteGroup
  lat: number
  lon: number
  /** Elevation relative to the 1737.4 km sphere; null until filled from LOLA. */
  alt_m: number | null
  /** ISO date (UTC), null for sites without a landing. */
  landing_date: string | null
  description: string
  /** URL of the coordinate source. */
  source: string
}

/** Columnar series: index i of every array refers to times[i] (ISO, UTC). */
export interface AzElTrack {
  /** Degrees, clockwise from north. */
  azimuth: number[]
  /** Degrees above the smooth sphere's horizon. */
  elevation: number[]
}

export interface EphemerisResponse {
  times: string[]
  sun: AzElTrack
  earth: AzElTrack
  step_minutes: number
}

export interface ScenarioRequest {
  lat: number
  lon: number
  alt_m?: number
  /** ISO datetime; treated as UTC when no offset is given. */
  start: string
  end: string
  step_minutes?: number
  /** Earth counts as visible when its center is this far above the skyline. */
  min_earth_elevation_deg?: number
}

export interface Window {
  start: string
  end: string
  duration_hours: number
  starts_before_range: boolean
  ends_after_range: boolean
}

export type Verdict = 'green' | 'yellow' | 'red'

export interface AnalyzeResponse {
  horizon_kind: 'sphere' | 'terrain'
  series: {
    times: string[]
    sun: AzElTrack & { skyline: number[]; visible_fraction: number[] }
    earth: AzElTrack & { skyline: number[]; visible: boolean[] }
  }
  windows: { sun: Window[]; earth: Window[]; both: Window[] }
  metrics: {
    sunlit_pct: number
    earth_visible_pct: number
    both_pct: number
    mean_sun_disk_fraction: number
    max_sun_el: number
    mean_sun_el_sunlit: number | null
    next_sunrise: string | null
    next_sunset: string | null
    next_earthrise: string | null
    next_earthset: string | null
    longest_dark_hours: number
    longest_no_earth_hours: number
    verdict: Verdict
    verdict_reasons: string[]
  }
}
