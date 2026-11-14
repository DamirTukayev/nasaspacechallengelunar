import { mockHealth, mockSites } from './mocks'
import type {
  AnalyzeResponse,
  EphemerisResponse,
  HealthResponse,
  HorizonResponse,
  NearbyRequest,
  NearbyResponse,
  TerrainResponse,
  ScenarioRequest,
  Site,
} from './types'

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

const MOCK_DELAY_MS = 300

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** FastAPI puts a string or a list of validation errors into `detail`. */
async function errorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg ?? String(d)).join('; ')
    }
  } catch {
    // Not JSON — fall back to the status code.
  }
  return null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    // The browser only says "Failed to fetch": the server is down or unreachable.
    throw new ApiError(0, `Can't reach the backend at ${API_URL}`)
  }
  if (!response.ok) {
    const detail = await errorDetail(response)
    const method = init?.method ?? 'GET'
    throw new ApiError(response.status, detail ?? `${method} ${path} failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

function mock<T>(data: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), MOCK_DELAY_MS))
}

function notMocked(name: string): Promise<never> {
  return Promise.reject(new ApiError(501, `${name} has no mock data; run the backend`))
}

export const api = {
  health: () => (USE_MOCKS ? mock(mockHealth) : request<HealthResponse>('/health')),

  sites: () => (USE_MOCKS ? mock(mockSites) : request<Site[]>('/api/sites')),

  ephemeris: (params: {
    lat: number
    lon: number
    start: string
    end: string
    alt_m?: number
    step_minutes?: number
  }) => {
    if (USE_MOCKS) return notMocked('Ephemeris')
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    )
    return request<EphemerisResponse>(`/api/ephemeris?${query}`)
  },

  horizon: (lat: number, lon: number, observerHeightM?: number) => {
    if (USE_MOCKS) return notMocked('Horizon')
    const query = new URLSearchParams({ lat: String(lat), lon: String(lon) })
    if (observerHeightM !== undefined) query.set('observer_height_m', String(observerHeightM))
    return request<HorizonResponse>(`/api/horizon?${query}`)
  },

  terrain: (lat: number, lon: number) => {
    if (USE_MOCKS) return notMocked('Terrain')
    const query = new URLSearchParams({ lat: String(lat), lon: String(lon) })
    return request<TerrainResponse>(`/api/terrain?${query}`)
  },

  analyze: (scenario: ScenarioRequest) =>
    USE_MOCKS
      ? notMocked('Analysis')
      : request<AnalyzeResponse>('/api/analyze', {
          method: 'POST',
          body: JSON.stringify(scenario),
        }),

  nearby: (scenario: NearbyRequest) =>
    USE_MOCKS
      ? notMocked('Nearby map')
      : request<NearbyResponse>('/api/nearby', {
          method: 'POST',
          body: JSON.stringify(scenario),
        }),
}
