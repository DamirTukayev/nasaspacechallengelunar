import { describe, expect, it } from 'vitest'
import type { AnalyzeResponse } from '../../api/types'
import { type CaptionContext, DEMO_SCENES } from './demo'
import { isDemoRequested } from './mode'

const analysis = (metrics: Partial<AnalyzeResponse['metrics']>, site_alt_m = 4921) =>
  ({
    site_alt_m,
    metrics: {
      sunlit_pct: 75.2,
      earth_visible_pct: 45.4,
      both_pct: 45,
      max_sun_el: 1.62,
      longest_dark_hours: 179.4,
      longest_both_hours: 319,
      ...metrics,
    },
  }) as AnalyzeResponse

const ctx = (over: Partial<CaptionContext>, a = analysis({})): CaptionContext => ({
  phase: 'running',
  progress: 0.2,
  revealed: false,
  analysis: a,
  ...over,
})

const [pole, malapert, im1] = DEMO_SCENES

describe('demo script', () => {
  it('visits the three polar showcase sites in order', () => {
    expect(DEMO_SCENES.map((s) => s.siteId)).toEqual(['south-pole', 'mons-malapert', 'im-1'])
  })

  it('has a caption for every phase of every scene', () => {
    for (const scene of DEMO_SCENES) {
      for (const phase of ['landing', 'tracing', 'running'] as const) {
        expect(scene.caption(ctx({ phase })).length).toBeGreaterThan(10)
      }
      expect(scene.caption(ctx({ revealed: true })).length).toBeGreaterThan(10)
    }
  })
})

describe('captions use the numbers on screen', () => {
  it('south pole: highest Sun, longest night, totals', () => {
    expect(pole.caption(ctx({ progress: 0.2 }))).toContain('1.6°')
    expect(pole.caption(ctx({ progress: 0.8 }))).toContain('7.5 d')
    expect(pole.caption(ctx({ revealed: true }))).toBe('Sunlit 75% of the time, Earth in view 45%')
  })

  it('Malapert: summit height and Earth visibility', () => {
    expect(malapert.caption(ctx({ phase: 'landing' }))).toContain('4.9 km')
    expect(malapert.caption(ctx({}, analysis({ earth_visible_pct: 100 })))).toBe(
      'The Earth never sets here: a direct link the whole time',
    )
    expect(malapert.caption(ctx({}, analysis({ earth_visible_pct: 80 })))).toBe(
      'The Earth stays up 80% of the time',
    )
    expect(
      malapert.caption(ctx({ phase: 'landing' }, analysis({}, null as unknown as number))),
    ).toBe('Mons Malapert, 120 km away')
  })

  it('IM-1: longest stretch with power and a link', () => {
    expect(im1.caption(ctx({ revealed: true }))).toBe(
      'Up to 13.3 d with both power and a direct link',
    )
  })
})

describe('isDemoRequested', () => {
  it.each([
    ['?demo=1', true],
    ['?show=1&demo=1', true],
    ['?demo=0', false],
    ['', false],
  ])('%s → %s', (search, expected) => {
    expect(isDemoRequested(search)).toBe(expected)
  })
})
