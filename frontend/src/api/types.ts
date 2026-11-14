// Draft API contract — see docs/mvp-plan.md. Keep in sync with the backend.

export interface HealthResponse {
  status: string
  version: string
}

export interface Site {
  id: string
  name: string
  group: string
  lat: number
  lon: number
  alt_m: number | null
  description: string
}
