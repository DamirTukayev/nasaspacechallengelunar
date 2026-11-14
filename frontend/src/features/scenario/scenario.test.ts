import { describe, expect, it } from 'vitest'
import { type ScenarioDraft, initialDraft, suggestStep, validateDraft } from './scenario'

const base: ScenarioDraft = {
  siteId: 'apollo-11',
  name: 'Apollo 11',
  lat: '0.67416',
  lon: '23.47314',
  start: '2026-12-01T00:00',
  end: '2026-12-15T00:00',
  stepMinutes: 60,
}

describe('validateDraft', () => {
  it('turns a valid draft into a UTC request', () => {
    const { errors, scenario } = validateDraft(base)

    expect(errors).toEqual({})
    expect(scenario?.name).toBe('Apollo 11')
    expect(scenario?.request).toEqual({
      lat: 0.67416,
      lon: 23.47314,
      start: '2026-12-01T00:00:00.000Z',
      end: '2026-12-15T00:00:00.000Z',
      step_minutes: 60,
    })
  })

  it('names custom sites by their coordinates', () => {
    const { scenario } = validateDraft({ ...base, siteId: 'custom', lat: '-89.5', lon: '10' })
    expect(scenario?.name).toBe('-89.500°, 10.000°')
  })

  it.each([
    [{ lat: '' }, 'lat'],
    [{ lat: '95' }, 'lat'],
    [{ lat: 'abc' }, 'lat'],
    [{ lon: '-181' }, 'lon'],
    [{ end: '2026-11-30T00:00' }, 'end'],
    [{ start: '' }, 'start'],
    [{ end: '2028-12-01T00:00', stepMinutes: 10 }, 'step'],
  ] as const)('rejects %o', (change, field) => {
    const { errors, scenario } = validateDraft({ ...base, ...change })
    expect(errors[field]).toBeTruthy()
    expect(scenario).toBeNull()
  })

  it('gives equal requests the same key', () => {
    expect(validateDraft(base).scenario?.key).toBe(validateDraft({ ...base }).scenario?.key)
  })

  it('starts from a valid default', () => {
    expect(validateDraft(initialDraft(new Date('2026-11-14T15:30:00Z'))).scenario).not.toBeNull()
  })
})

describe('suggestStep', () => {
  it('keeps hourly steps for a month and coarsens for long ranges', () => {
    const start = new Date('2026-01-01T00:00:00Z')
    expect(suggestStep(start, new Date('2026-02-01T00:00:00Z'))).toBe(10)
    expect(suggestStep(start, new Date('2027-01-01T00:00:00Z'))).toBe(30)
    expect(suggestStep(start, new Date('2030-01-01T00:00:00Z'))).toBe(180)
  })
})
