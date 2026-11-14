import { describe, expect, it } from 'vitest'
import {
  FAN_TOTAL_SECONDS,
  GROW_SECONDS,
  SWEEP_SECONDS,
  rayGrowth,
  rayOpacity,
  raysDone,
} from './fan'

describe('rayGrowth', () => {
  it('starts each ray in compass order', () => {
    expect(rayGrowth(0, 0, 720)).toBe(0)
    expect(rayGrowth(GROW_SECONDS, 0, 720)).toBe(1)
    // The ray at 180° starts halfway through the sweep.
    expect(rayGrowth(SWEEP_SECONDS / 2 - 0.01, 360, 720)).toBe(0)
    expect(rayGrowth(SWEEP_SECONDS / 2 + GROW_SECONDS, 360, 720)).toBe(1)
  })

  it('grows monotonically', () => {
    const values = [0, 0.05, 0.1, 0.2, 0.3, 0.4].map((t) => rayGrowth(t, 0, 720))
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })
})

describe('raysDone', () => {
  it('counts finished rays from none to all', () => {
    expect(raysDone(0, 720)).toBe(0)
    expect(raysDone(GROW_SECONDS + SWEEP_SECONDS / 2 + 0.001, 720)).toBe(361)
    expect(raysDone(FAN_TOTAL_SECONDS, 720)).toBe(720)
  })
})

describe('rayOpacity', () => {
  it('stays bright through the sweep, then fades to a faint trace', () => {
    expect(rayOpacity(1)).toBe(0.55)
    expect(rayOpacity(FAN_TOTAL_SECONDS + 10)).toBeCloseTo(0.08)
  })
})
