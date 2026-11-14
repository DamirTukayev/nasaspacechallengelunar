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
