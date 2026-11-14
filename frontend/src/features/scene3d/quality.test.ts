import { describe, expect, it } from 'vitest'
import { initialQuality, lowerQuality, QUALITY } from './quality'
describe('scene quality', () => {
  it('starts phones and low resource devices without shadows or heatmaps', () => {
    expect(initialQuality({ coarse: true, cores: 8 })).toBe('low')
    expect(initialQuality({ coarse: false, cores: 4 })).toBe('low')
    expect(initialQuality({ coarse: false, cores: 8, memory: 4 })).toBe('low')
    expect(QUALITY.low.shadowSize).toBe(0)
    expect(QUALITY.low.bloom).toBe(false)
  })
  it('reduces load monotonically and leaves a fast device alone', () => {
    expect(lowerQuality('high', 60)).toBe('high')
    expect(lowerQuality('high', 40)).toBe('balanced')
    expect(lowerQuality('balanced', 40)).toBe('low')
    expect(lowerQuality('low', 20)).toBe('low')
    expect(QUALITY.low.dpr).toBeLessThan(QUALITY.balanced.dpr)
    expect(QUALITY.balanced.shadowSize).toBeLessThan(QUALITY.high.shadowSize)
  })
})
