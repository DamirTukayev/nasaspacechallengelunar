import { describe, expect, it } from 'vitest'
import type { Window } from '../../api/types'
import { formatCountdown, statusAt } from './countdown'

const H = 3_600_000
const T0 = Date.parse('2026-12-01T00:00:00Z')
const at = (hours: number) => T0 + hours * H
const iso = (hours: number) => new Date(at(hours)).toISOString()

function win(from: number, to: number, openStart = false, openEnd = false): Window {
  return {
    start: iso(from),
    end: iso(to),
    duration_hours: to - from,
    starts_before_range: openStart,
    ends_after_range: openEnd,
  }
}

// Range 0–100 h: up 0–10 (open at start), 30–40, 90–100 (open at end).
const windows = [win(0, 10, true), win(30, 40), win(90, 100, false, true)]
const END = at(100)

describe('statusAt', () => {
  it('counts down to the end of the current window', () => {
    const s = statusAt(windows, at(4), END)
    expect(s).toMatchObject({ up: true, event: 'set', msUntil: 6 * H })
    expect(s.at?.getTime()).toBe(at(10))
  })

  it('counts down to the next window while down', () => {
    const s = statusAt(windows, at(20), END)
    expect(s).toMatchObject({ up: false, event: 'rise', msUntil: 10 * H })
    expect(s.at?.getTime()).toBe(at(30))
  })

  it('treats a window end as already set', () => {
    expect(statusAt(windows, at(40), END)).toMatchObject({ up: false, event: 'rise' })
  })

  it('has no set time for a window still open at the end of the range', () => {
    const s = statusAt(windows, at(95), END)
    expect(s).toMatchObject({ up: true, event: 'set', at: null, msUntil: 5 * H })
  })

  it('stays up on the very last sample of an open window', () => {
    expect(statusAt(windows, END, END)).toMatchObject({ up: true, at: null, msUntil: 0 })
  })

  it('reports no rise when nothing comes before the end', () => {
    const s = statusAt([win(0, 10, true)], at(50), END)
    expect(s).toMatchObject({ up: false, event: 'rise', at: null, msUntil: 50 * H })
  })

  it('handles a body that never shows up', () => {
    expect(statusAt([], at(0), END)).toMatchObject({ up: false, at: null, msUntil: 100 * H })
  })
})

describe('formatCountdown', () => {
  it.each([
    [30_000, '< 1 min'],
    [12 * 60_000, '12 min'],
    [5 * H, '5 h'],
    [5 * H + 20 * 60_000, '5 h 20 min'],
    [3 * 24 * H, '3 d'],
    [3 * 24 * H + 4 * H + 59 * 60_000, '3 d 4 h'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatCountdown(ms)).toBe(text)
  })
})
