import type { HealthResponse, Site } from './types'

// Subset of backend/app/data/sites.json for working without the backend.
export const mockHealth: HealthResponse = { status: 'ok', version: 'mock' }

export const mockSites: Site[] = [
  {
    id: 'apollo-11',
    name: 'Apollo 11',
    group: 'Apollo',
    lat: 0.67416,
    lon: 23.47314,
    alt_m: null,
    landing_date: '1969-07-20',
    description: 'Mare Tranquillitatis. First crewed landing.',
    source: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html',
  },
  {
    id: 'im-1',
    name: 'IM-1 Odysseus',
    group: 'CLPS',
    lat: -80.13,
    lon: 1.44,
    alt_m: null,
    landing_date: '2024-02-22',
    description: 'Intuitive Machines, near Malapert A. Landed on a ~12° slope and tipped over.',
    source: 'https://en.wikipedia.org/wiki/IM-1',
  },
  {
    id: 'chandrayaan-3',
    name: 'Chandrayaan-3',
    group: 'International',
    lat: -69.3734,
    lon: 32.3198,
    alt_m: null,
    landing_date: '2023-08-23',
    description: 'ISRO, Vikram lander. Southernmost landing at the time (Statio Shiv Shakti).',
    source: 'https://planetarynames.wr.usgs.gov/Feature/16272',
  },
  {
    id: 'shackleton',
    name: 'Shackleton crater (center)',
    group: 'South Pole',
    lat: -89.67,
    lon: 129.78,
    alt_m: null,
    landing_date: null,
    description:
      'Floor of a 21 km crater in permanent shadow — an example of a site the Sun never reaches.',
    source: 'https://planetarynames.wr.usgs.gov/Feature/5450',
  },
]
