import { describe, expect, it } from 'vitest'
import type { Site } from '../api/types'
import { validateDraft } from '../features/scenario/scenario'
import { searchToState, stateToSearch } from '../features/share/shareUrl'
import { appHref, isLandingSearchRequested, pageForLocation, plannerHref } from './navigation'

describe('public pages and existing entry links', () => {
  it('opens Home for a plain visit, including tracking parameters', () => {
    expect(pageForLocation('/', '')).toBe('home')
    expect(pageForLocation('/', '?utm_source=demo')).toBe('home')
  })

  it.each([
    ['?show=0', 'planner'],
    ['?show=1', 'mission-control'],
    ['?demo=1', 'mission-control'],
    ['?show=0&demo=1', 'mission-control'],
    ['?s=south-pole,2026-11-14T00:00,2026-12-13T12:44,60', 'planner'],
    ['?c=-89.5~10,2026-11-14T00:00,2026-12-13T12:44,60&v=compare', 'planner'],
    ['?show=1&s=south-pole,2026-11-14T00:00,2026-12-13T12:44,60', 'mission-control'],
  ] as const)('preserves the destination of a root link %s', (search, page) => {
    expect(pageForLocation('/', search)).toBe(page)
  })

  it('uses explicit tool paths even when an old mode flag disagrees', () => {
    expect(pageForLocation('/planner', '?show=1&demo=1')).toBe('planner')
    expect(pageForLocation('/mission-control', '?show=0')).toBe('mission-control')
  })

  it.each(['/about', '/planner', '/mission-control'] as const)(
    'accepts a trailing slash on %s',
    (path) => {
      expect(pageForLocation(`${path}/`, '')).toBe(pageForLocation(path, ''))
    },
  )

  it('keeps unknown addresses out of the calculation screens', () => {
    expect(pageForLocation('/missing', '?show=1')).toBe('not-found')
  })
})

describe('moving shared scenarios between tools', () => {
  const sites = [{ id: 'south-pole', name: 'Lunar South Pole', lat: -90, lon: 0 }] as Site[]
  const scenario = (siteId: string, lat: string, lon: string) =>
    validateDraft({
      siteId,
      lat,
      lon,
      name: sites.find((site) => site.id === siteId)?.name ?? '',
      start: '2026-11-14T00:00',
      end: '2026-12-13T12:44',
      stepMinutes: 60,
    }).scenario!
  const pole = scenario('south-pole', '-90', '0')
  const custom = scenario('custom', '-89.5', '10')
  const state = { active: pole, compared: [pole, custom], view: 'compare' as const }

  it.each(['planner', 'show'] as const)(
    'retains the active site, all comparisons and tab in %s',
    (mode) => {
      const href = appHref(
        mode,
        `${stateToSearch(state)}&show=0&demo=1&tool=landing-search`,
        mode === 'show',
      )
      const url = new URL(href, 'http://localhost')
      // Test with the actual scenario decoder, including repeated c= entries and custom coordinates.
      expect(searchToState(url.search, sites)).toEqual(state)
      expect(url.searchParams.has('show')).toBe(false)
      expect(url.searchParams.has('tool')).toBe(false)
      expect(url.searchParams.get('demo')).toBe(mode === 'show' ? '1' : null)
      expect(pageForLocation(url.pathname, url.search)).toBe(
        mode === 'show' ? 'mission-control' : 'planner',
      )
    },
  )

  it('starts an automatic demo only when requested explicitly', () => {
    expect(appHref('show')).toBe('/mission-control')
    expect(appHref('show', '', true)).toBe('/mission-control?demo=1')
    expect(appHref('planner', '?demo=1', true)).toBe('/planner')
  })

  it('recognizes Landing Search only for its explicit tool parameter', () => {
    expect(isLandingSearchRequested('?tool=landing-search')).toBe(true)
    expect(isLandingSearchRequested('?tool=other')).toBe(false)
    expect(isLandingSearchRequested('')).toBe(false)
  })

  it('opens the requested tool within Planner and respects explicit screen paths', () => {
    expect(pageForLocation('/', '?tool=landing-search')).toBe('planner')
    expect(pageForLocation('/planner/', '?tool=landing-search')).toBe('planner')
    expect(pageForLocation('/mission-control', '?tool=landing-search')).toBe('mission-control')
  })

  it('keeps the existing rehearsal offset only in Landing Search', () => {
    const search = '?tool=landing-search&t=40'
    expect(
      new URL(plannerHref(search, 'landing-search'), 'http://localhost').searchParams.get('t'),
    ).toBe('40')
    expect(new URL(plannerHref(search), 'http://localhost').searchParams.has('t')).toBe(false)
    expect(new URL(appHref('show', search), 'http://localhost').searchParams.has('t')).toBe(false)
    expect(
      new URL(plannerHref('?t=-1', 'landing-search'), 'http://localhost').searchParams.has('t'),
    ).toBe(false)
  })

  it.each(['analysis', 'landing-search'] as const)(
    'retains scenarios, comparisons and tab in the %s tool',
    (tool) => {
      const href = plannerHref(`${stateToSearch(state)}&tool=landing-search&demo=1`, tool)
      const url = new URL(href, 'http://localhost')
      expect(url.pathname).toBe('/planner')
      expect(searchToState(url.search, sites)).toEqual(state)
      expect(isLandingSearchRequested(url.search)).toBe(tool === 'landing-search')
      expect(url.searchParams.has('demo')).toBe(false)
    },
  )
})
