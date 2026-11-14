import { describe, expect, it } from 'vitest'
import { type Scenario } from '../scenario/scenario'
import { initialMode, showScenarios } from './mode'

describe('initialMode', () => {
  it.each([
    ['', null, 'show'], // first visit
    ['', 'show', 'show'],
    ['', 'planner', 'planner'], // the visitor left Mission Control last time
    ['?show=1', 'planner', 'show'], // explicit link wins
    ['?show=0', null, 'planner'],
    ['?s=south-pole,2026-11-14T00:00,2026-12-13T12:44,60', null, 'planner'], // shared scenario
    ['?c=south-pole,2026-11-14T00:00,2026-12-13T12:44,60&v=compare', null, 'planner'],
    ['?show=1&s=south-pole,2026-11-14T00:00,2026-12-13T12:44,60', null, 'show'],
  ] as const)('%s with stored %s → %s', (search, stored, mode) => {
    expect(initialMode(search, stored)).toBe(mode)
  })
})

const scenario = (siteId: string, key = siteId): Scenario => ({
  key,
  name: siteId,
  siteId,
  request: { lat: 0, lon: 0, start: '', end: '', step_minutes: 60 },
})

describe('showScenarios', () => {
  const showcase = [scenario('south-pole'), scenario('mons-malapert'), scenario('im-1')]

  it('offers the showcase when nothing is open', () => {
    expect(showScenarios(null, showcase).map((s) => s.siteId)).toEqual([
      'south-pole',
      'mons-malapert',
      'im-1',
    ])
  })

  it('puts the open scenario first and skips its site in the showcase', () => {
    const open = scenario('mons-malapert', 'other-dates')
    expect(showScenarios(open, showcase).map((s) => s.key)).toEqual([
      'other-dates',
      'south-pole',
      'im-1',
    ])
  })

  it('keeps custom coordinates alongside all showcase sites', () => {
    const custom = scenario('custom', 'custom-1')
    expect(showScenarios(custom, showcase)).toHaveLength(4)
  })
})
