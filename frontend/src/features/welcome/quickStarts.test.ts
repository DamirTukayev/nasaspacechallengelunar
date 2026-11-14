import { describe, expect, it } from 'vitest'
import { isLocalUrl } from '../../api/client'
import type { Site } from '../../api/types'
import { allQuickStartScenarios, quickStartScenarios } from './quickStarts'

const site = (id: string, lat: number, lon: number) => ({ id, name: id, lat, lon }) as Site

const SITES = [
  site('south-pole', -90, 0),
  site('mons-malapert', -85.98, -1.67),
  site('im-1', -80.13, 1.44),
  site('apollo-11', 0.67416, 23.47314),
]
const NOW = new Date('2026-11-14T13:45:00Z')

describe('quick starts', () => {
  it('builds one scenario per site on the default dates', () => {
    const { drafts, scenarios } = quickStartScenarios('polar-trio', SITES, NOW)

    expect(scenarios.map((s) => s.siteId)).toEqual(['south-pole', 'mons-malapert', 'im-1'])
    expect(drafts[0].siteId).toBe('south-pole')
    expect(scenarios[0].request.start).toBe('2026-11-14T00:00:00.000Z')
  })

  it('skips sites missing from the catalog', () => {
    const { scenarios } = quickStartScenarios('polar-trio', SITES.slice(0, 1), NOW)
    expect(scenarios.map((s) => s.siteId)).toEqual(['south-pole'])
  })

  it('prefetches each scenario once, with the same request a click sends', () => {
    const all = allQuickStartScenarios(SITES, NOW)

    // The south pole is in two quick starts but is loaded once.
    expect(all.map((s) => s.siteId).sort()).toEqual([
      'apollo-11',
      'im-1',
      'mons-malapert',
      'south-pole',
    ])
    const clicked = quickStartScenarios('apollo-11', SITES, NOW).scenarios[0]
    expect(all.find((s) => s.siteId === 'apollo-11')?.request).toEqual(clicked.request)
  })
})

describe('isLocalUrl', () => {
  it.each([
    ['http://localhost:8000', true],
    ['http://127.0.0.1:8000/', true],
    ['http://[::1]:8000', true],
    ['https://api.example.com', false],
    ['https://localhost.example.com', false],
  ])('%s → %s', (url, expected) => {
    expect(isLocalUrl(url)).toBe(expected)
  })
})
