import { describe, expect, it } from 'vitest'
import type { Site } from '../../api/types'
import { validateDraft } from '../scenario/scenario'
import { decodeScenario, encodeScenario, searchToState, stateToSearch } from './shareUrl'

const site = (id: string, name: string, lat: number, lon: number) =>
  ({ id, name, lat, lon }) as Site

const SITES = [
  site('south-pole', 'Lunar South Pole', -90, 0),
  site('mons-malapert', 'Mons Malapert', -85.98, -1.67),
]

const scenario = (siteId: string, lat: string, lon: string, name = '') =>
  validateDraft({
    siteId,
    name,
    lat,
    lon,
    start: '2026-11-14T00:00',
    end: '2026-12-13T12:44',
    stepMinutes: 60,
  }).scenario!

const malapert = scenario('mons-malapert', '-85.98', '-1.67', 'Mons Malapert')
const pole = scenario('south-pole', '-90', '0', 'Lunar South Pole')
const custom = scenario('custom', '-89.5', '10')

describe('scenario tokens', () => {
  it('uses the catalog id for catalog sites', () => {
    expect(encodeScenario(malapert)).toBe('mons-malapert,2026-11-14T00:00,2026-12-13T12:44,60')
  })

  it('uses coordinates for custom sites', () => {
    expect(encodeScenario(custom)).toBe('-89.5~10,2026-11-14T00:00,2026-12-13T12:44,60')
  })

  it.each([malapert, pole, custom])('round-trips %#', (s) => {
    const back = decodeScenario(encodeScenario(s), SITES)
    expect(back).toEqual(s)
  })

  it.each([
    'mons-malapert,2026-11-14T00:00,2026-12-13T12:44', // missing step
    'atlantis,2026-11-14T00:00,2026-12-13T12:44,60', // unknown site
    'mons-malapert,2026-11-14,2026-12-13T12:44,60', // bad date
    'mons-malapert,2026-11-14T00:00,2026-12-13T12:44,7', // step not offered
    'mons-malapert,2026-12-13T12:44,2026-11-14T00:00,60', // end before start
    '-95~10,2026-11-14T00:00,2026-12-13T12:44,60', // latitude out of range
    'abc~10,2026-11-14T00:00,2026-12-13T12:44,60', // not a number
  ])('rejects %s', (token) => {
    expect(decodeScenario(token, SITES)).toBeNull()
  })
})

describe('page URL', () => {
  it('round-trips the open scenario, the comparison and the tab', () => {
    const state = { active: malapert, compared: [pole, malapert, custom], view: 'compare' as const }
    const search = stateToSearch(state)

    expect(search).toBe(
      '?s=mons-malapert,2026-11-14T00:00,2026-12-13T12:44,60' +
        '&c=south-pole,2026-11-14T00:00,2026-12-13T12:44,60' +
        '&c=mons-malapert,2026-11-14T00:00,2026-12-13T12:44,60' +
        '&c=-89.5~10,2026-11-14T00:00,2026-12-13T12:44,60' +
        '&v=compare',
    )
    expect(searchToState(search, SITES)).toEqual(state)
  })

  it('is empty when nothing is open', () => {
    expect(stateToSearch({ active: null, compared: [], view: 'details' })).toBe('')
  })

  it('also reads links where a messenger percent-encoded the separators', () => {
    const encoded = '?s=mons-malapert%2C2026-11-14T00%3A00%2C2026-12-13T12%3A44%2C60'
    expect(searchToState(encoded, SITES).active).toEqual(malapert)
  })

  it('skips broken and duplicate entries and caps the comparison', () => {
    const token = encodeScenario(pole)
    const many = Array.from({ length: 6 }, (_, i) =>
      encodeScenario(scenario('custom', String(-80 - i), '0')),
    )
    const search = `?s=nonsense&c=${token}&c=${token}&c=broken&${many.map((t) => `c=${t}`).join('&')}`

    const state = searchToState(search, SITES)
    expect(state.active).toBeNull()
    expect(state.compared).toHaveLength(4)
    expect(state.compared[0]).toEqual(pole)
  })

  it('falls back to Details when there is nothing to compare', () => {
    expect(searchToState(`?s=${encodeScenario(pole)}&v=compare`, SITES).view).toBe('details')
  })
})
