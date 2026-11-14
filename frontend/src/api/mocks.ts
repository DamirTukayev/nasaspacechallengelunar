import type { HealthResponse, Site } from './types'

// Placeholder data until the backend catalog (B2) is ready.
export const mockHealth: HealthResponse = { status: 'ok', version: 'mock' }

export const mockSites: Site[] = [
  {
    id: 'apollo-11',
    name: 'Apollo 11',
    group: 'Apollo',
    lat: 0.6741,
    lon: 23.473,
    alt_m: null,
    description: 'Mare Tranquillitatis, 1969',
  },
  {
    id: 'apollo-17',
    name: 'Apollo 17',
    group: 'Apollo',
    lat: 20.1908,
    lon: 30.7717,
    alt_m: null,
    description: 'Taurus–Littrow valley, 1972',
  },
  {
    id: 'change-4',
    name: "Chang'e 4",
    group: 'International',
    lat: -45.4446,
    lon: 177.5991,
    alt_m: null,
    description: 'Von Kármán crater, far side, 2019',
  },
  {
    id: 'chandrayaan-3',
    name: 'Chandrayaan-3',
    group: 'International',
    lat: -69.373,
    lon: 32.319,
    alt_m: null,
    description: 'High southern latitudes, 2023',
  },
]
