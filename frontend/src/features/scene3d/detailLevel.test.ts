import { describe, expect, it } from 'vitest'
import { detailLevel } from './detailLevel'

describe('terrain detail distance', () => {
  it('keeps a coarse globe, adds regional detail, then a close-up', () => {
    expect(detailLevel(3000, 0)).toBe(0)
    expect(detailLevel(20, 0)).toBe(4)
    expect(detailLevel(2, 4)).toBe(1)
  })
  it('uses hysteresis so small camera changes do not keep fetching levels', () => {
    expect(detailLevel(32, 4)).toBe(4)
    expect(detailLevel(32, 0)).toBe(0)
    expect(detailLevel(3.5, 1)).toBe(1)
    expect(detailLevel(3.5, 4)).toBe(4)
  })
})
