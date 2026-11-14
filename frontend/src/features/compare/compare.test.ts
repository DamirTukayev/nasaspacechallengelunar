import { describe, expect, it } from 'vitest'
import { bestIndices, bestVerdicts } from './compare'

describe('bestIndices', () => {
  it('picks the highest value when higher is better', () => {
    expect(bestIndices([40, 75, 60], 'high')).toEqual(new Set([1]))
  })

  it('picks the lowest value when lower is better', () => {
    expect(bestIndices([179, 280, 90], 'low')).toEqual(new Set([2]))
  })

  it('marks ties as joint best', () => {
    expect(bestIndices([100, 60, 100], 'high')).toEqual(new Set([0, 2]))
  })

  it('treats near-equal values as a tie', () => {
    expect(bestIndices([75.2, 75.5, 40], 'high')).toEqual(new Set([0, 1]))
  })

  it('highlights nothing when all values are practically equal', () => {
    expect(bestIndices([100, 100, 99.8], 'high')).toEqual(new Set())
  })

  it('ignores scenarios that are still loading', () => {
    expect(bestIndices([null, 30, 70], 'high')).toEqual(new Set([2]))
    expect(bestIndices([null, 30, null], 'high')).toEqual(new Set())
  })
})

describe('bestVerdicts', () => {
  it('prefers green over yellow over red', () => {
    expect(bestVerdicts(['red', 'green', 'yellow'])).toEqual(new Set([1]))
    expect(bestVerdicts(['red', 'yellow', 'yellow'])).toEqual(new Set([1, 2]))
  })

  it('highlights nothing when all verdicts match', () => {
    expect(bestVerdicts(['red', 'red'])).toEqual(new Set())
  })
})
