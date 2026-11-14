import { describe, expect, it } from 'vitest'
import { DAY_MS, HOUR_MS } from '../../lib/time'
import { nearestIndex, timeTicks } from './ticks'

const T0 = Date.parse('2026-11-14T00:00:00Z')

describe('timeTicks', () => {
  it('uses whole UTC days for a lunar day on a wide chart', () => {
    const ticks = timeTicks(T0, T0 + 29.5 * DAY_MS, 650)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.length).toBeLessThanOrEqual(650 / 72)
    for (const t of ticks) expect(t.ms % DAY_MS).toBe(0)
    expect(ticks[0].label).toMatch(/^[A-Z][a-z]{2} \d\d$/)
  })

  it('shows hours for a short range', () => {
    const ticks = timeTicks(T0, T0 + 12 * HOUR_MS, 650)
    expect(ticks.some((t) => t.label === '06:00')).toBe(true)
    expect(ticks[0].label).toBe('Nov 14')
  })

  it('keeps ticks inside the range', () => {
    const start = T0 + 5 * HOUR_MS
    const end = start + 40 * DAY_MS
    for (const t of timeTicks(start, end, 300)) {
      expect(t.ms).toBeGreaterThanOrEqual(start)
      expect(t.ms).toBeLessThanOrEqual(end)
    }
  })
})

describe('nearestIndex', () => {
  const times = [0, 10, 20, 30]

  it.each([
    [-5, 0],
    [4, 0],
    [6, 1],
    [25, 2],
    [26, 3],
    [99, 3],
  ])('%i → %i', (ms, index) => {
    expect(nearestIndex(times, ms)).toBe(index)
  })
})
