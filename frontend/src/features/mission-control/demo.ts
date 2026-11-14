import type { AnalyzeResponse } from '../../api/types'
import { formatDuration } from '../../lib/time'

export type ShowPhase = 'landing' | 'tracing' | 'running'

export interface CaptionContext {
  phase: ShowPhase
  /** 0…1 of the period played so far. */
  progress: number
  /** The period has been played to the end and the verdict is on screen. */
  revealed: boolean
  analysis: AnalyzeResponse
}

export interface DemoScene {
  siteId: string
  /** Playback speed for this scene, days per second. */
  speedDays: number
  caption: (ctx: CaptionContext) => string
}

const pct = (v: number) => `${Math.round(v)}%`

/**
 * The automatic show: three polar sites over the same lunar day.
 * Every number in a caption comes from the analysis on screen, so the text stays true
 * whatever dates the show runs on.
 */
export const DEMO_SCENES: DemoScene[] = [
  {
    siteId: 'south-pole',
    speedDays: 2,
    caption: ({ phase, progress, revealed, analysis: { metrics: m } }) => {
      if (phase === 'landing')
        return 'The lunar south pole: crater floors in endless shadow, rims in sunlight much of the time'
      if (phase === 'tracing') return 'Tracing the real skyline from LRO laser altimetry'
      if (revealed)
        return `Sunlit ${pct(m.sunlit_pct)} of the time, Earth in view ${pct(m.earth_visible_pct)}`
      return progress < 0.5
        ? `The Sun never climbs above ${m.max_sun_el.toFixed(1)}°: it circles the horizon`
        : `Ridges hide the Sun and the Earth: the longest night lasts ${formatDuration(m.longest_dark_hours)}`
    },
  },
  {
    siteId: 'mons-malapert',
    speedDays: 2,
    caption: ({ phase, revealed, analysis }) => {
      const m = analysis.metrics
      const alt = analysis.site_alt_m
      if (phase === 'landing')
        return alt !== null
          ? `Mons Malapert, 120 km away: a summit ${(alt / 1000).toFixed(1)} km above the reference sphere`
          : 'Mons Malapert, 120 km away'
      if (phase === 'tracing') return 'From a summit, the skyline dips below the horizontal'
      if (revealed)
        return `Earth in view ${pct(m.earth_visible_pct)} of the time: same dates, a different story`
      return m.earth_visible_pct >= 99
        ? 'The Earth never sets here: a direct link the whole time'
        : `The Earth stays up ${pct(m.earth_visible_pct)} of the time`
    },
  },
  {
    siteId: 'im-1',
    speedDays: 3,
    caption: ({ phase, revealed, analysis: { metrics: m } }) => {
      if (phase === 'landing') return 'IM-1 Odysseus touched down here in February 2024'
      if (phase === 'tracing') return 'Every site gets its own skyline'
      const both = formatDuration(m.longest_both_hours ?? 0)
      if (revealed) return `Up to ${both} with both power and a direct link`
      return 'Power and a link to Earth for part of the lunar day, then the long night'
    },
  },
]

/** Seconds the revealed verdict stays on screen before the show moves on. */
export const SCENE_HOLD_SECONDS = 5
