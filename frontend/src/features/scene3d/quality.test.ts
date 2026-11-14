import { describe, expect, it } from 'vitest'
import {
  initialQuality,
  lowerQuality,
  advanceQuality,
  type AutoQualityState,
  QUALITY,
} from './quality'
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

describe('adaptive quality experiments', () => {
  const sample = (state: AutoQualityState, fps: number, variation = 0.03) =>
    advanceQuality(state, fps, variation)
  function probe(fps: number) {
    return sample(sample({ quality: 'high', slow: 0 }, fps), fps)
  }
  it('keeps a reduction when steady 40 fps improves under lower load', () => {
    let state = probe(40)
    expect(state.quality).toBe('balanced')
    state = sample(state, 20) // Ignore the shader transition window.
    state = sample(state, 58)
    state = sample(state, 60)
    expect(state).toEqual({ quality: 'balanced', slow: 0 })
  })
  it('restores quality at a confirmed 30 fps cap without cycling', () => {
    let state = probe(30)
    for (const fps of [25, 30, 29.8]) state = sample(state, fps)
    expect(state.quality).toBe('high')
    expect(state.cap).toBe(30)
    state = sample(state, 20) // Ignore shader work when restoring the original profile.
    expect(state.quality).toBe('high')
    for (let i = 0; i < 20; i++) state = sample(state, 30)
    expect(state.quality).toBe('high')
    expect(state.probe).toBeUndefined()
    state = sample(sample(state, 22), 22)
    expect(state.quality).toBe('balanced')
    expect(state.cap).toBeUndefined()
  })
  it('does not mistake a GPU-bound 30 fps cadence for a browser cap', () => {
    let state = probe(30)
    for (const fps of [30, 45, 46]) state = sample(state, fps)
    expect(state.quality).toBe('balanced')
    expect(state.cap).toBeUndefined()
    state = sample(sample(state, 45), 45)
    expect(state.quality).toBe('low')
    expect(state.probe).toBeDefined()
  })
  it('reduces sustained jitter and severe slowdowns without probing', () => {
    const state = sample(sample({ quality: 'high', slow: 0 }, 35, 0.3), 35, 0.3)
    expect(state).toEqual({ quality: 'balanced', slow: 0 })
    expect(sample({ quality: 'high', slow: 1 }, 60).slow).toBe(0)
    expect(sample({ quality: 'low', slow: 1 }, 20).quality).toBe('low')
  })
})
