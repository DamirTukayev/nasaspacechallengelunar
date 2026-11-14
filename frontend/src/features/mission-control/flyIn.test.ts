import { describe, expect, it } from 'vitest'
import { shouldFlyIn } from './flyIn'

describe('shouldFlyIn', () => {
  it('plays on the first visit only', () => {
    expect(shouldFlyIn({ reducedMotion: false, seen: false, demoStep: null })).toBe(true)
    expect(shouldFlyIn({ reducedMotion: false, seen: true, demoStep: null })).toBe(false)
  })

  it('always opens the automatic show, and only its first scene', () => {
    expect(shouldFlyIn({ reducedMotion: false, seen: true, demoStep: 0 })).toBe(true)
    expect(shouldFlyIn({ reducedMotion: false, seen: false, demoStep: 1 })).toBe(false)
  })

  it('never plays with reduced motion', () => {
    expect(shouldFlyIn({ reducedMotion: true, seen: false, demoStep: null })).toBe(false)
    expect(shouldFlyIn({ reducedMotion: true, seen: false, demoStep: 0 })).toBe(false)
  })
})
