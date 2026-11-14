import { mockHealth, mockSites } from './mocks'
import type { HealthResponse, Site } from './types'

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `${init?.method ?? 'GET'} ${path} failed: ${response.status}`,
    )
  }
  return response.json() as Promise<T>
}

function mock<T>(data: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), MOCK_DELAY_MS))
}

export const api = {
  health: () => (USE_MOCKS ? mock(mockHealth) : request<HealthResponse>('/health')),
  sites: () => (USE_MOCKS ? mock(mockSites) : request<Site[]>('/api/sites')),
}
