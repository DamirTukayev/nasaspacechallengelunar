import { describe, expect, it } from 'vitest'
import type { AnalyzeResponse, Window } from '../../api/types'
import { metricsUntil } from './live'

const H = 3_600_000
const T0 = Date.parse('2026-12-01T00:00:00Z')
const iso = (h: number) => new Date(T0 + h * H).toISOString()
const win = (from: number, to: number): Window => ({
  start: iso(from),
  end: iso(to),
  duration_hours: to - from,
  starts_before_range: from === 0,
  ends_after_range: to === 100,
})

/**
 * 100 h, hourly. Sun 0–40 and 70–100; Earth 20–90; both = the overlaps 20–40 and 70–90.
 * Whole-period values, as the backend computes them: sun 70%, Earth 70%, both 40%,
 * longest night 30 h (40–70), longest Sun + Earth stretch 20 h.
 */
const analysis = {
  series: { times: Array.from({ length: 101 }, (_, h) => iso(h)) },
  windows: {
    sun: [win(0, 40), win(70, 100)],
    earth: [win(20, 90)],
    both: [win(20, 40), win(70, 90)],
  },
} as unknown as AnalyzeResponse

describe('metricsUntil', () => {
  it('equals the whole-period metrics at the last sample', () => {
    expect(metricsUntil(analysis, T0 + 100 * H)).toEqual({
      elapsedHours: 100,
      sunlitPct: 70,
      earthPct: 70,
      bothPct: 40,
      longestDarkHours: 30,
      longestBothHours: 20,
    })
  })

  it('only counts the part played so far', () => {
    const m = metricsUntil(analysis, T0 + 50 * H)
    expect(m.elapsedHours).toBe(50)
    expect(m.sunlitPct).toBe(80) // 40 of 50 h
    expect(m.earthPct).toBe(60) // 30 of 50 h
    expect(m.bothPct).toBe(40) // 20 of 50 h
    expect(m.longestDarkHours).toBe(10) // the night so far: 40–50
    expect(m.longestBothHours).toBe(20)
  })

  it('cuts a window that is still open', () => {
    const m = metricsUntil(analysis, T0 + 30 * H)
    expect(m.bothPct).toBeCloseTo((100 * 10) / 30)
    expect(m.longestBothHours).toBe(10)
  })

  it('is all zero at the very start', () => {
    expect(metricsUntil(analysis, T0).sunlitPct).toBe(0)
    expect(metricsUntil(analysis, T0 - 5 * H).elapsedHours).toBe(0)
  })
})
