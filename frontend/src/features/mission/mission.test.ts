import { describe, expect, it } from 'vitest'
import type { AnalyzeResponse } from '../../api/types'
import { isMission, missionVerdict } from './mission'

const base = {
  verdict: 'red',
  verdict_reasons: ['Longest darkness 12.4 d (over the 100 h limit)'],
} as unknown as AnalyzeResponse['metrics']

describe('missionVerdict', () => {
  it('picks the verdict for the chosen mission', () => {
    const metrics = {
      ...base,
      mission_verdicts: {
        lunar_day: { verdict: 'green', reasons: ['Sun and Earth together for up to 13.0 d'] },
        survive_night: { verdict: 'red', reasons: base.verdict_reasons },
      },
    } as AnalyzeResponse['metrics']

    expect(missionVerdict(metrics, 'lunar_day').verdict).toBe('green')
    expect(missionVerdict(metrics, 'survive_night').verdict).toBe('red')
  })

  it('falls back to the original verdict from an older backend', () => {
    expect(missionVerdict(base, 'lunar_day')).toEqual({
      verdict: 'red',
      reasons: base.verdict_reasons,
    })
  })
})

describe('isMission', () => {
  it('accepts only known missions (e.g. from storage)', () => {
    expect(isMission('lunar_day')).toBe(true)
    expect(isMission('survive_night')).toBe(true)
    expect(isMission('mars')).toBe(false)
    expect(isMission(null)).toBe(false)
  })
})
