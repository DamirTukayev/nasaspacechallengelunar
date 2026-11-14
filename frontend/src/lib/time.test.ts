import { describe, expect, it } from 'vitest'
import { formatDuration, fromUtcInput, toUtcInput } from './time'

describe('formatDuration', () => {
  it.each([
    [0, 'Never'],
    [0.5, '30 min'],
    [5, '5.0 h'],
    [179.5, '7.5 d'],
  ])('%f h → %s', (hours, text) => {
    expect(formatDuration(hours)).toBe(text)
  })
})

describe('UTC input values', () => {
  it('round-trips through the datetime-local format as UTC', () => {
    const date = new Date('2026-12-01T05:30:00Z')
    expect(toUtcInput(date)).toBe('2026-12-01T05:30')
    expect(fromUtcInput('2026-12-01T05:30')?.toISOString()).toBe('2026-12-01T05:30:00.000Z')
  })

  it('rejects malformed values', () => {
    expect(fromUtcInput('')).toBeNull()
    expect(fromUtcInput('2026-13-45T99:99')).toBeNull()
  })
})
