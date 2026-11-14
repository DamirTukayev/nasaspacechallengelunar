import { describe, expect, it } from 'vitest'
import type { CalendarDay, CalendarResponse, Verdict } from '../../api/types'
import { DAY_MS, LUNAR_DAY_MS } from '../../lib/time'
import {
  bestIndex,
  calendarRequest,
  daysLater,
  defaultMissionMs,
  formatDay,
  formatRange,
  formatValue,
  landingNote,
  missionOptions,
  monthRows,
  moveFocus,
  runs,
  score,
  verdictSummary,
} from './calendar'

const START = Date.parse('2026-11-14T00:00:00Z')

function day(index: number, change: Partial<CalendarDay> = {}): CalendarDay {
  const start = START + index * DAY_MS
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + 7 * DAY_MS).toISOString(),
    sunlit_pct: 50,
    earth_visible_pct: 50,
    both_pct: 25,
    longest_dark_hours: 80,
    longest_no_earth_hours: 80,
    longest_both_hours: 40,
    both_from_start_hours: 40,
    both_outlasts_mission: false,
    sunlit_at_start: true,
    earth_at_start: true,
    verdicts: { lunar_day: 'red', survive_night: 'red' },
    ...change,
  }
}

const verdictDays = (verdicts: Verdict[]) =>
  verdicts.map((v, i) => day(i, { verdicts: { lunar_day: v, survive_night: 'red' } }))

const calendarOf = (days: CalendarDay[]): CalendarResponse => ({
  horizon_kind: 'sphere',
  site_alt_m: null,
  mission_hours: 168,
  step_minutes: 60,
  days,
})

describe('calendarRequest', () => {
  const scenario = { lat: -90, lon: 0, start: '2026-11-14T00:00:00.000Z', step_minutes: 60 }

  it('keeps the site and the first landing moment, and sets the mission length', () => {
    expect(calendarRequest(scenario, 14 * DAY_MS, 182)).toEqual({
      lat: -90,
      lon: 0,
      start: '2026-11-14T00:00:00.000Z',
      end: '2026-11-28T00:00:00.000Z',
      step_minutes: 60,
      days: 182,
    })
  })

  it('never samples finer than an hour, but keeps a coarser step', () => {
    expect(calendarRequest({ ...scenario, step_minutes: 10 }, DAY_MS, 91).step_minutes).toBe(60)
    expect(calendarRequest({ ...scenario, step_minutes: 180 }, DAY_MS, 91).step_minutes).toBe(180)
  })
})

describe('mission length', () => {
  it('opens with the length of the scenario, to the minute like the form', () => {
    expect(defaultMissionMs(7 * DAY_MS)).toBe(7 * DAY_MS)
    // The form's "Lunar day" preset ends at 29 d 12 h 44 min.
    expect(defaultMissionMs(LUNAR_DAY_MS)).toBe(((29 * 24 + 12) * 60 + 44) * 60_000)
  })

  it('falls back to a lunar day for a scenario too long to be one mission', () => {
    expect(defaultMissionMs(365 * DAY_MS)).toBe(defaultMissionMs(LUNAR_DAY_MS))
  })

  it('offers the scenario length only when it is not already a preset', () => {
    expect(missionOptions(14 * DAY_MS).map((o) => o.label)).toEqual([
      '7 days',
      '14 days',
      'Lunar day',
    ])
    expect(missionOptions(3 * DAY_MS)[0]).toEqual({ ms: 3 * DAY_MS, label: 'As analysed (3.0 d)' })
    expect(missionOptions(365 * DAY_MS)).toHaveLength(3)
  })

  it('always offers the default', () => {
    for (const own of [5 * DAY_MS, 14 * DAY_MS, LUNAR_DAY_MS, 365 * DAY_MS]) {
      expect(missionOptions(own).map((o) => o.ms)).toContain(defaultMissionMs(own))
    }
  })
})

describe('monthRows', () => {
  // 14 Nov 2026 → 2 Jan 2027: half of November, all of December, two days of January.
  const rows = monthRows(Array.from({ length: 50 }, (_, i) => day(i)))

  it('starts a row at every month, across the year', () => {
    expect(rows.map((r) => r.label)).toEqual(['Nov 2026', 'Dec 2026', 'Jan 2027'])
    expect(rows.map((r) => r.cells.length)).toEqual([17, 31, 2])
  })

  it('puts every date in the column of its day of the month', () => {
    expect(rows[0].cells[0]).toMatchObject({ index: 0, dom: 14 })
    expect(rows[1].cells[0]).toMatchObject({ index: 17, dom: 1 })
    expect(rows[2].cells[1]).toMatchObject({ index: 49, dom: 2 })
  })

  it('moves the focus by days and by months', () => {
    expect(moveFocus(rows, 0, 'ArrowLeft')).toBe(0)
    expect(moveFocus(rows, 0, 'ArrowRight')).toBe(1)
    expect(moveFocus(rows, 49, 'ArrowRight')).toBe(49)
    // 14 Nov ↓ 14 Dec; 14 Dec ↑ 14 Nov.
    expect(moveFocus(rows, 0, 'ArrowDown')).toBe(30)
    expect(moveFocus(rows, 30, 'ArrowUp')).toBe(0)
    // 5 Dec ↑: November starts on the 14th, the closest day there is.
    expect(moveFocus(rows, 21, 'ArrowUp')).toBe(0)
    // 31 Dec ↓: January has only the 1st and 2nd here.
    expect(moveFocus(rows, 47, 'ArrowDown')).toBe(49)
    expect(moveFocus(rows, 0, 'ArrowUp')).toBe(0)
    expect(moveFocus(rows, 10, 'End')).toBe(49)
    expect(moveFocus(rows, 10, 'Home')).toBe(0)
    expect(moveFocus(rows, 10, 'a')).toBe(10)
  })
})

describe('values', () => {
  it('scores percentages as they are and work time against the mission length', () => {
    const d = day(0, { sunlit_pct: 75, both_from_start_hours: 42 })
    expect(score(d, 'sunlit_pct', 168)).toBe(75)
    expect(score(d, 'both_from_start_hours', 168)).toBe(25)
    expect(score(day(0, { both_from_start_hours: 200 }), 'both_from_start_hours', 168)).toBe(100)
  })

  it('formats them the way the metric cards do', () => {
    expect(formatValue(day(0, { sunlit_pct: 74.6 }), 'sunlit_pct')).toBe('75%')
    expect(formatValue(day(0, { both_from_start_hours: 60 }), 'both_from_start_hours')).toBe(
      '2.5 d',
    )
    expect(formatValue(day(0, { both_from_start_hours: 0 }), 'both_from_start_hours')).toBe('none')
  })

  it('finds the first of the best dates', () => {
    const calendar = calendarOf([10, 60, 30, 60].map((v, i) => day(i, { sunlit_pct: v })))
    expect(bestIndex(calendar, 'sunlit_pct')).toBe(1)
    expect(bestIndex(calendarOf([]), 'sunlit_pct')).toBeNull()
  })
})

describe('landing windows', () => {
  it('groups consecutive passing dates', () => {
    expect(runs([false, true, true, false, true])).toEqual([
      { from: 1, to: 2 },
      { from: 4, to: 4 },
    ])
    expect(runs([false, false])).toEqual([])
  })

  it('counts verdicts for the chosen mission and finds the next viable date', () => {
    const days = verdictDays(['red', 'yellow', 'green', 'green', 'red', 'green'])
    const summary = verdictSummary(days, 'lunar_day')
    expect(summary.counts).toEqual({ green: 3, yellow: 1, red: 2 })
    expect(summary.windows).toEqual([
      { from: 2, to: 3 },
      { from: 5, to: 5 },
    ])
    expect(summary.firstViable).toBe(2)
    // The other kind of mission is red on every date here.
    expect(verdictSummary(days, 'survive_night').firstViable).toBeNull()
  })
})

describe('words', () => {
  it('formats dates in UTC', () => {
    expect(formatDay('2026-11-14T00:00:00Z')).toBe('14 Nov 2026')
    expect(formatDay('2026-12-31T23:30:00Z', false)).toBe('31 Dec')
  })

  it('shortens a range inside one month', () => {
    expect(formatRange('2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')).toBe('14 Nov')
    expect(formatRange('2026-11-14T00:00:00Z', '2026-11-19T00:00:00Z')).toBe('14–19 Nov')
    expect(formatRange('2026-11-28T00:00:00Z', '2026-12-03T00:00:00Z')).toBe('28 Nov – 3 Dec')
    expect(formatRange('2026-12-30T00:00:00Z', '2027-01-02T00:00:00Z')).toBe('30 Dec – 2 Jan')
  })

  it('counts days from the scenario', () => {
    expect(daysLater(0)).toBe('the date above')
    expect(daysLater(1)).toBe('1 day later')
    expect(daysLater(28)).toBe('28 days later')
  })

  it('says what the lander finds at touchdown', () => {
    expect(landingNote(day(0, { both_from_start_hours: 60 }))).toBe(
      'Sun and Earth for 2.5 d from landing',
    )
    expect(landingNote(day(0, { both_outlasts_mission: true }))).toBe(
      'Sun and Earth for the whole mission',
    )
    expect(landingNote(day(0, { sunlit_at_start: false }))).toBe('Lands in darkness')
    expect(landingNote(day(0, { earth_at_start: false }))).toBe('Lands with no Earth link')
    expect(landingNote(day(0, { sunlit_at_start: false, earth_at_start: false }))).toBe(
      'Lands with neither Sun nor Earth',
    )
  })
})
