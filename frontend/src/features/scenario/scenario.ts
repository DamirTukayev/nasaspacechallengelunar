import type { ScenarioRequest, Site } from '../../api/types'
import { DAY_MS, LUNAR_DAY_MS, fromUtcInput, startOfUtcDay, toUtcInput } from '../../lib/time'

export const CUSTOM_SITE = 'custom'
/** Same limit as the backend. */
export const MAX_POINTS = 20_000
/** JPL Horizons prints Julian calendar dates before 1583; the API rejects them. */
export const EARLIEST_INPUT = '1583-01-01T00:00'
const EARLIEST_START = new Date(`${EARLIEST_INPUT}Z`)

export const STEP_OPTIONS = [
  { minutes: 10, label: '10 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 180, label: '3 hours' },
  { minutes: 360, label: '6 hours' },
] as const

export const DURATION_PRESETS = [
  { label: '7 days', ms: 7 * DAY_MS },
  { label: '14 days', ms: 14 * DAY_MS },
  { label: 'Lunar day', ms: LUNAR_DAY_MS },
  { label: '3 months', ms: 91 * DAY_MS },
  { label: '1 year', ms: 365 * DAY_MS },
] as const

/** What the form edits. Coordinates are strings so a half-typed number is not lost. */
export interface ScenarioDraft {
  siteId: string
  name: string
  lat: string
  lon: string
  start: string
  end: string
  stepMinutes: number
}

/** A validated scenario, ready to send and to compare. */
export interface Scenario {
  key: string
  name: string
  siteId: string
  request: Required<Pick<ScenarioRequest, 'lat' | 'lon' | 'start' | 'end' | 'step_minutes'>>
}

export type DraftErrors = Partial<Record<'lat' | 'lon' | 'start' | 'end' | 'step', string>>

export function initialDraft(now = new Date()): ScenarioDraft {
  const start = startOfUtcDay(now)
  // Matches the "south-pole" entry of the backend catalog.
  return {
    siteId: 'south-pole',
    name: 'Lunar South Pole',
    lat: '-90',
    lon: '0',
    start: toUtcInput(start),
    end: toUtcInput(new Date(start.getTime() + LUNAR_DAY_MS)),
    stepMinutes: 60,
  }
}

export function draftFromSite(draft: ScenarioDraft, site: Site): ScenarioDraft {
  return {
    ...draft,
    siteId: site.id,
    name: site.name,
    lat: String(site.lat),
    lon: String(site.lon),
  }
}

export function draftFromScenario(scenario: Scenario): ScenarioDraft {
  const { request } = scenario
  return {
    siteId: scenario.siteId,
    name: scenario.name,
    lat: String(request.lat),
    lon: String(request.lon),
    start: toUtcInput(new Date(request.start)),
    end: toUtcInput(new Date(request.end)),
    stepMinutes: request.step_minutes,
  }
}

function parseNumber(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function pointCount(start: Date, end: Date, stepMinutes: number): number {
  return Math.floor((end.getTime() - start.getTime()) / 60_000 / stepMinutes) + 1
}

/** The finest step that keeps the grid under the backend limit. */
export function suggestStep(start: Date, end: Date): number {
  const fitting = STEP_OPTIONS.find((o) => pointCount(start, end, o.minutes) <= MAX_POINTS)
  return fitting?.minutes ?? STEP_OPTIONS[STEP_OPTIONS.length - 1].minutes
}

export function validateDraft(draft: ScenarioDraft): {
  errors: DraftErrors
  scenario: Scenario | null
} {
  const errors: DraftErrors = {}

  const lat = parseNumber(draft.lat)
  if (lat === null) errors.lat = 'Enter a latitude'
  else if (lat < -90 || lat > 90) errors.lat = 'Latitude must be between −90 and 90'

  const lon = parseNumber(draft.lon)
  if (lon === null) errors.lon = 'Enter a longitude'
  else if (lon < -180 || lon > 180) errors.lon = 'Longitude must be between −180 and 180'

  const start = fromUtcInput(draft.start)
  const end = fromUtcInput(draft.end)
  if (!start) errors.start = 'Pick a start date'
  else if (start < EARLIEST_START) errors.start = 'Pick a date in 1583 or later'
  if (!end) errors.end = 'Pick an end date'
  else if (start && end <= start) errors.end = 'End must be after start'

  if (start && end && end > start) {
    const points = pointCount(start, end, draft.stepMinutes)
    if (points < 2) {
      errors.step = 'Choose a smaller time step or a period at least one step long'
    } else if (points > MAX_POINTS) {
      errors.step = `${points.toLocaleString()} points — too many, pick a coarser step`
    }
  }

  if (Object.keys(errors).length > 0 || lat === null || lon === null || !start || !end) {
    return { errors, scenario: null }
  }

  const request = {
    lat,
    lon,
    start: start.toISOString(),
    end: end.toISOString(),
    step_minutes: draft.stepMinutes,
  }
  return {
    errors,
    scenario: {
      key: JSON.stringify(request),
      name: draft.siteId === CUSTOM_SITE ? `${lat.toFixed(3)}°, ${lon.toFixed(3)}°` : draft.name,
      siteId: draft.siteId,
      request,
    },
  }
}
