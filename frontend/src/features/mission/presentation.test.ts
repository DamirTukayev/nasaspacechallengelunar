import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchToState } from '../share/shareUrl'
import { appHref, plannerHref } from '../../lib/navigation'
import {
  landingQuery,
  loadLandingSearch,
  loadSavedLandingSearch,
  matchesLandingRequest,
  type LandingRequest,
  type LandingSearch,
} from './landing'
import { candidateHref, landingPresentation } from './presentation'
import { moonTrekTiles } from './moonTrek'

const data = {
  period_start: '2027-01-01T00:00:00+00:00',
  period_end: '2028-01-01T00:00:00+00:00',
  step_minutes: 360,
  radius_km: 80,
  spacing_km: 5,
  points: { lat: [-88.811, -89.3], lon: [123.6901, 135], eligible: [true, false] },
} as unknown as LandingSearch
const request: LandingRequest = {
  start: '2027-01-01T00:00:00Z',
  end: '2028-01-01T00:00:00Z',
  stepMinutes: 360,
  radiusKm: 80,
  spacingKm: 5,
}
afterEach(() => vi.unstubAllGlobals())

describe('saved and live search loading', () => {
  it('opens the saved example without launching a backend grid calculation', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))
    vi.stubGlobal('fetch', fetch)
    expect(await loadSavedLandingSearch()).toEqual({ data, source: 'precomputed' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toMatch(/data\/landing-search.json$/)
  })
  it('keeps original saved metadata when a requested live calculation is unavailable', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(data)))
    vi.stubGlobal('fetch', fetch)
    const result = await loadLandingSearch({ ...request, radiusKm: 40 })
    expect(result.source).toBe('precomputed')
    expect(result.data.radius_km).toBe(80)
    expect(matchesLandingRequest(result.data, { ...request, radiusKm: 40 })).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('does not start an offline fetch after navigation cancels the live request', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    vi.stubGlobal('fetch', fetch)
    await expect(loadLandingSearch(request, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('search presentation and candidate handoff', () => {
  it('preserves the map view on reload and strips it from other tools', () => {
    const search = '?tool=landing-search&landing-view=map&t=40'
    expect(landingPresentation(search)).toBe('map')
    expect(landingPresentation('?landing-view=unknown')).toBe('scene')
    expect(
      landingPresentation(new URL(plannerHref(search, 'landing-search'), 'http://local').search),
    ).toBe('map')
    expect(new URL(appHref('show', search), 'http://local').searchParams.has('landing-view')).toBe(
      false,
    )
    expect(new URL(plannerHref(search), 'http://local').searchParams.has('landing-view')).toBe(
      false,
    )
  })
  it.each(['planner', 'show'] as const)(
    'opens a candidate in %s with the displayed result period and comparisons',
    (mode) => {
      const comparison = '-89.5~10,2026-11-14T00:00,2026-12-13T00:00,60'
      const href = candidateHref(
        data,
        0,
        mode,
        `?c=${comparison}&v=compare&tool=landing-search&landing-view=map&t=40`,
      )!
      const url = new URL(href, 'http://local')
      const shared = searchToState(url.search, [])
      expect(shared.active?.request).toEqual({
        lat: -88.811,
        lon: 123.6901,
        start: '2027-01-01T00:00:00.000Z',
        end: '2028-01-01T00:00:00.000Z',
        step_minutes: 360,
      })
      expect(shared.compared).toHaveLength(1)
      expect(shared.view).toBe('details')
      expect(url.searchParams.has('tool')).toBe(false)
      expect(url.searchParams.has('landing-view')).toBe(false)
      expect(url.searchParams.has('t')).toBe(false)
    },
  )
  it('does not hand off ineligible or missing candidates', () => {
    expect(candidateHref(data, 1, 'show')).toBeNull()
    expect(candidateHref(data, -1, 'planner')).toBeNull()
    expect(candidateHref(data, 999, 'show')).toBeNull()
  })
})

describe('requested versus saved search metadata', () => {
  it('passes real date, grid and radius parameters to the existing API', () => {
    const params = new URLSearchParams(landingQuery(request))
    expect(params.get('start')).toBe(request.start)
    expect(params.get('end')).toBe(request.end)
    expect(params.get('radius_km')).toBe('80')
    expect(params.get('spacing_km')).toBe('5')
    expect(params.get('step_minutes')).toBe('360')
    expect(landingQuery()).toBe('')
  })
  it('accepts equivalent UTC notation and detects a fallback from another scenario', () => {
    expect(matchesLandingRequest(data, request)).toBe(true)
    expect(matchesLandingRequest(data)).toBe(true)
    expect(matchesLandingRequest(data, { ...request, start: '2026-11-15T00:00:00Z' })).toBe(false)
    expect(matchesLandingRequest(data, { ...request, radiusKm: 40 })).toBe(false)
    expect(matchesLandingRequest(data, { ...request, spacingKm: 10 })).toBe(false)
    expect(matchesLandingRequest(data, { ...request, stepMinutes: 60 })).toBe(false)
  })
})

describe('Moon Trek polar tile placement', () => {
  it('covers the search square with four correctly oriented tiles around the pole', () => {
    const tiles = moonTrekTiles(90)
    expect(tiles).toHaveLength(4)
    expect(tiles.map((tile) => tile.url.split('/').slice(-2).join('/'))).toEqual([
      '7/7.png',
      '7/8.png',
      '8/7.png',
      '8/8.png',
    ])
    expect(tiles[0].leftKm).toBeCloseTo(-136.99125)
    expect(tiles[0].topKm).toBeCloseTo(136.99125)
    expect(tiles[3].leftKm).toBeCloseTo(0)
    expect(tiles[3].topKm).toBeCloseTo(0)
    for (const [x, y] of [
      [-90, 90],
      [90, 90],
      [-90, -90],
      [90, -90],
    ]) {
      expect(
        tiles.some(
          (tile) =>
            x >= tile.leftKm &&
            x <= tile.leftKm + tile.sizeKm &&
            y <= tile.topKm &&
            y >= tile.topKm - tile.sizeKm,
        ),
      ).toBe(true)
    }
  })
  it('bounds requests to the supported local search extent', () => {
    expect(moonTrekTiles(NaN)).toEqual([])
    expect(moonTrekTiles(0)).toEqual([])
    expect(moonTrekTiles(1000)).toEqual([])
    expect(moonTrekTiles(150)).toHaveLength(16)
  })
})
