import type {
  CalendarDay,
  CalendarRequest,
  CalendarResponse,
  Mission,
  ScenarioRequest,
  Verdict,
} from '../../api/types'
import { DAY_MS, HOUR_MS, LUNAR_DAY_MS, formatDuration } from '../../lib/time'

export type CalendarMetric =
  'verdict' | 'both_from_start_hours' | 'sunlit_pct' | 'earth_visible_pct'

export const CALENDAR_METRICS: { key: CalendarMetric; label: string }[] = [
  { key: 'verdict', label: 'Verdict' },
  { key: 'both_from_start_hours', label: 'Work time from landing' },
  { key: 'sunlit_pct', label: 'Sunlight' },
  { key: 'earth_visible_pct', label: 'Earth in view' },
]

export const SPAN_OPTIONS = [
  { days: 91, label: '3 months' },
  { days: 182, label: '6 months' },
  { days: 365, label: '1 year' },
] as const
export const DEFAULT_SPAN_DAYS = 182

const MINUTE_MS = 60_000
/** Same limit as the backend: a mission of many months has no landing day to pick. */
export const MAX_MISSION_MS = 60 * DAY_MS
/** The calendar never samples finer than this: months of dates at 10 minutes are too many. */
const MIN_STEP_MINUTES = 60

/** Whole minutes, as the scenario form keeps its dates. */
const wholeMinutes = (ms: number) => Math.floor(ms / MINUTE_MS) * MINUTE_MS

const MISSION_PRESETS = [
  { ms: 7 * DAY_MS, label: '7 days' },
  { ms: 14 * DAY_MS, label: '14 days' },
  { ms: wholeMinutes(LUNAR_DAY_MS), label: 'Lunar day' },
]

export function scenarioMs(request: Pick<ScenarioRequest, 'start' | 'end'>): number {
  return Date.parse(request.end) - Date.parse(request.start)
}

/** The mission the calendar opens with: the scenario's own length, unless it is too long. */
export function defaultMissionMs(ownMs: number): number {
  return ownMs <= MAX_MISSION_MS ? wholeMinutes(ownMs) : wholeMinutes(LUNAR_DAY_MS)
}

/** The presets, with the scenario's own length first when it is not one of them. */
export function missionOptions(ownMs: number): { ms: number; label: string }[] {
  const own = wholeMinutes(ownMs)
  if (own > MAX_MISSION_MS || MISSION_PRESETS.some((p) => p.ms === own)) return MISSION_PRESETS
  return [{ ms: own, label: `As analysed (${formatDuration(own / HOUR_MS)})` }, ...MISSION_PRESETS]
}

export function calendarStepMinutes(stepMinutes: number): number {
  return Math.max(MIN_STEP_MINUTES, stepMinutes)
}

export function calendarRequest(
  request: Pick<ScenarioRequest, 'lat' | 'lon' | 'start' | 'step_minutes'>,
  missionMs: number,
  days: number,
): CalendarRequest {
  return {
    lat: request.lat,
    lon: request.lon,
    start: request.start,
    end: new Date(Date.parse(request.start) + missionMs).toISOString(),
    step_minutes: calendarStepMinutes(request.step_minutes ?? MIN_STEP_MINUTES),
    days,
  }
}

// --- layout: one row per month, one column per day of the month --------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface CalendarCell {
  index: number
  /** Day of the month, 1–31 (UTC). */
  dom: number
  day: CalendarDay
}

export interface MonthRow {
  key: string
  label: string
  cells: CalendarCell[]
}

export function monthRows(days: CalendarDay[]): MonthRow[] {
  const rows: MonthRow[] = []
  days.forEach((day, index) => {
    const date = new Date(day.start)
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`
    let row = rows[rows.length - 1]
    if (!row || row.key !== key) {
      row = { key, label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`, cells: [] }
      rows.push(row)
    }
    row.cells.push({ index, dom: date.getUTCDate(), day })
  })
  return rows
}

/** Where an arrow key takes the focus: left/right a day, up/down the same day a month away. */
export function moveFocus(rows: MonthRow[], index: number, key: string): number {
  const last = rows.reduce((n, r) => n + r.cells.length, 0) - 1
  if (key === 'ArrowLeft') return Math.max(0, index - 1)
  if (key === 'ArrowRight') return Math.min(last, index + 1)
  if (key === 'Home') return 0
  if (key === 'End') return last
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return index

  const r = rows.findIndex((row) => row.cells.some((c) => c.index === index))
  const target = rows[r + (key === 'ArrowUp' ? -1 : 1)]
  if (r < 0 || !target) return index
  const dom = rows[r].cells.find((c) => c.index === index)!.dom
  // The 31st has no neighbour in a 30-day month: take the closest day there is.
  return target.cells.reduce((best, c) =>
    Math.abs(c.dom - dom) < Math.abs(best.dom - dom) ? c : best,
  ).index
}

// --- values ------------------------------------------------------------------------------

/** 0–100 for the colour scale. Work time is measured against the mission length. */
export function score(
  day: CalendarDay,
  metric: Exclude<CalendarMetric, 'verdict'>,
  missionHours: number,
): number {
  if (metric !== 'both_from_start_hours') return day[metric]
  return missionHours > 0 ? Math.min(100, (100 * day.both_from_start_hours) / missionHours) : 0
}

export function formatValue(day: CalendarDay, metric: Exclude<CalendarMetric, 'verdict'>): string {
  if (metric !== 'both_from_start_hours') return `${day[metric].toFixed(0)}%`
  return day.both_from_start_hours > 0 ? formatDuration(day.both_from_start_hours) : 'none'
}

/** The first date with the highest value; null for an empty calendar. */
export function bestIndex(
  calendar: CalendarResponse,
  metric: Exclude<CalendarMetric, 'verdict'>,
): number | null {
  let best: number | null = null
  calendar.days.forEach((day, i) => {
    const value = score(day, metric, calendar.mission_hours)
    if (best === null || value > score(calendar.days[best], metric, calendar.mission_hours)) {
      best = i
    }
  })
  return best
}

export interface DateRun {
  from: number
  to: number
}

/** Stretches of consecutive dates that pass: the landing windows. */
export function runs(flags: boolean[]): DateRun[] {
  const result: DateRun[] = []
  flags.forEach((ok, i) => {
    if (!ok) return
    const current = result[result.length - 1]
    if (current && current.to === i - 1) current.to = i
    else result.push({ from: i, to: i })
  })
  return result
}

export function verdictSummary(days: CalendarDay[], mission: Mission) {
  const counts: Record<Verdict, number> = { green: 0, yellow: 0, red: 0 }
  for (const d of days) counts[d.verdicts[mission]] += 1
  const windows = runs(days.map((d) => d.verdicts[mission] === 'green'))
  return { counts, windows, firstViable: windows.length > 0 ? windows[0].from : null }
}

// --- words -------------------------------------------------------------------------------

export function formatDay(iso: string, withYear = true): string {
  const date = new Date(iso)
  const text = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
  return withYear ? `${text} ${date.getUTCFullYear()}` : text
}

/** "14 Nov", "14–19 Nov", "28 Nov – 3 Dec". */
export function formatRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso)
  const to = new Date(toIso)
  if (from.getTime() === to.getTime()) return formatDay(fromIso, false)
  if (from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()) {
    return `${from.getUTCDate()}–${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]}`
  }
  return `${formatDay(fromIso, false)} – ${formatDay(toIso, false)}`
}

export function daysLater(days: number): string {
  if (days === 0) return 'the date above'
  return days === 1 ? '1 day later' : `${days} days later`
}

/** What the lander finds at touchdown, in one line. */
export function landingNote(day: CalendarDay): string {
  if (!day.sunlit_at_start && !day.earth_at_start) return 'Lands with neither Sun nor Earth'
  if (!day.sunlit_at_start) return 'Lands in darkness'
  if (!day.earth_at_start) return 'Lands with no Earth link'
  return day.both_outlasts_mission
    ? 'Sun and Earth for the whole mission'
    : `Sun and Earth for ${formatDuration(day.both_from_start_hours)} from landing`
}
