import { describe, expect, it } from 'vitest'
import { needsReveal } from './useRevealOnChange'

describe('needsReveal', () => {
  it.each([
    [899, 812, true], // phone: the result starts below the screen after "Analyze"
    [700, 812, true], // only a sliver visible at the bottom
    [120, 812, false], // desktop: already beside the form
    [0, 812, false],
    [-300, 812, true], // scrolled past it
  ])('top %i in a %i px viewport → %s', (top, height, expected) => {
    expect(needsReveal(top, height)).toBe(expected)
  })
})
