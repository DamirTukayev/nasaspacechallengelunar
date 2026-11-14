import { type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from 'react'
import { useCalendar } from '../../api/calendar'
import type { CalendarDay, CalendarResponse, Mission } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { formatDuration, formatUtc } from '../../lib/time'
import { MISSIONS } from '../mission/mission'
import { useMission } from '../mission/useMission'
import { colorFor } from '../nearby/nearby'
import type { Scenario } from '../scenario/scenario'
import {
  CALENDAR_METRICS,
  type CalendarCell,
  type CalendarMetric,
  DEFAULT_SPAN_DAYS,
  type MonthRow,
  SPAN_OPTIONS,
  bestIndex,
  calendarRequest,
  calendarStepMinutes,
  daysLater,
  defaultMissionMs,
  formatDay,
  formatRange,
  formatValue,
  landingNote,
  missionOptions,
  monthRows,
  moveFocus,
  scenarioMs,
  score,
  verdictSummary,
} from './calendar'

const CELL = 20
const GAP = 2
const LABEL_W = 64
const HEADER_H = 16
const DAY_TICKS = [1, 5, 10, 15, 20, 25, 30]
const LEGEND_STOPS = [0, 25, 50, 75, 100]
const MAX_WINDOWS_SHOWN = 6
const VERDICT_LABEL = { green: 'Viable', yellow: 'Marginal', red: 'Not viable' } as const

interface Props {
  scenario: Scenario
  /** Open the same site on other dates as its own scenario. */
  onOpenDates: (start: string, end: string) => void
}

const cellX = (dom: number) => LABEL_W + (dom - 1) * CELL
const rowY = (row: number) => HEADER_H + row * CELL

function Grid({
  calendar,
  rows,
  metric,
  mission,
  starIndex,
  onOpen,
}: {
  calendar: CalendarResponse
  rows: MonthRow[]
  metric: CalendarMetric
  mission: Mission
  /** The date the summary points at: the first viable one, or the best. */
  starIndex: number | null
  onOpen: (day: CalendarDay) => void
}) {
  const [hover, setHover] = useState<CalendarCell | null>(null)
  // One tab stop for the whole grid; the arrow keys move inside it.
  const [focus, setFocus] = useState(0)
  const cellRefs = useRef<(SVGRectElement | null)[]>([])
  const metricLabel = CALENDAR_METRICS.find((m) => m.key === metric)!.label
  const corners = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>()
    rows.forEach((row, r) =>
      row.cells.forEach((c) => map.set(c.index, { x: cellX(c.dom), y: rowY(r) })),
    )
    return map
  }, [rows])
  /** Draws something over the square of one landing date, if that date is on the grid. */
  function mark(index: number | null, draw: (x: number, y: number) => ReactNode) {
    const at = index === null ? undefined : corners.get(index)
    return at ? draw(at.x, at.y) : null
  }
  const width = LABEL_W + 31 * CELL
  const height = HEADER_H + rows.length * CELL

  function onKeyDown(e: KeyboardEvent<SVGRectElement>, cell: CalendarCell) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(cell.day)
      return
    }
    const next = moveFocus(rows, cell.index, e.key)
    if (next !== cell.index) {
      e.preventDefault()
      setFocus(next)
      cellRefs.current[next]?.focus()
    }
  }

  function describe(day: CalendarDay): string {
    const value =
      metric === 'verdict'
        ? VERDICT_LABEL[day.verdicts[mission]]
        : `${metricLabel} ${formatValue(day, metric)}`
    return `Landing ${formatDay(day.start)}: ${value}. ${landingNote(day)}. Open these dates.`
  }

  return (
    <div className="calendar-grid-wrap">
      <div className="calendar-scroll">
        <svg
          className="calendar-grid"
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`${metricLabel} for each landing date, one row per month, one column per day of the month`}
          onMouseLeave={() => setHover(null)}
        >
          {DAY_TICKS.map((d) => (
            <text
              key={d}
              x={cellX(d) + CELL / 2}
              y={HEADER_H - 5}
              className="calendar-axis"
              textAnchor="middle"
            >
              {d}
            </text>
          ))}
          {rows.map((row, r) => (
            <g key={row.key}>
              <text
                x={LABEL_W - 8}
                y={rowY(r) + CELL / 2}
                className="calendar-axis"
                textAnchor="end"
                dominantBaseline="central"
              >
                {row.label}
              </text>
              {row.cells.map((cell) => (
                <rect
                  key={cell.index}
                  ref={(el) => {
                    cellRefs.current[cell.index] = el
                  }}
                  x={cellX(cell.dom) + GAP / 2}
                  y={rowY(r) + GAP / 2}
                  width={CELL - GAP}
                  height={CELL - GAP}
                  rx={0}
                  className="calendar-cell"
                  data-verdict={metric === 'verdict' ? cell.day.verdicts[mission] : undefined}
                  fill={
                    metric === 'verdict'
                      ? undefined
                      : colorFor(score(cell.day, metric, calendar.mission_hours))
                  }
                  tabIndex={cell.index === focus ? 0 : -1}
                  role="button"
                  aria-label={describe(cell.day)}
                  onMouseEnter={() => setHover(cell)}
                  onFocus={() => {
                    setHover(cell)
                    setFocus(cell.index)
                  }}
                  onClick={() => onOpen(cell.day)}
                  onKeyDown={(e) => onKeyDown(e, cell)}
                />
              ))}
            </g>
          ))}
          {/* The scenario's own date: a ring around the first square. */}
          {mark(0, (x, y) => (
            <rect
              x={x + GAP / 2 - 1}
              y={y + GAP / 2 - 1}
              width={CELL - GAP + 2}
              height={CELL - GAP + 2}
              rx={0}
              className="calendar-here"
              pointerEvents="none"
            />
          ))}
          {starIndex !== 0 &&
            mark(starIndex, (x, y) => (
              <text
                x={x + CELL / 2}
                y={y + CELL / 2}
                className="calendar-best"
                textAnchor="middle"
                dominantBaseline="central"
                pointerEvents="none"
              >
                ★
              </text>
            ))}
          {mark(hover?.index ?? null, (x, y) => (
            <rect
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={0}
              className="calendar-hover"
              pointerEvents="none"
            />
          ))}
        </svg>
      </div>

      <div className="calendar-tooltip" aria-live="polite">
        {hover ? (
          <>
            <strong>
              Landing {formatDay(hover.day.start)}
              <span className="muted"> · {daysLater(hover.index)}</span>
            </strong>
            <span className="calendar-tooltip-verdict" data-verdict={hover.day.verdicts[mission]}>
              <span className="verdict-dot" aria-hidden="true" />
              {VERDICT_LABEL[hover.day.verdicts[mission]]} · {landingNote(hover.day)}
            </span>
            <span>
              Sunlight {hover.day.sunlit_pct.toFixed(0)}% · Earth{' '}
              {hover.day.earth_visible_pct.toFixed(0)}% · Sun + Earth{' '}
              {hover.day.both_pct.toFixed(0)}%
            </span>
            <span>
              {hover.day.longest_dark_hours < 1 / 60
                ? 'No darkness'
                : `Longest darkness ${formatDuration(hover.day.longest_dark_hours)}`}
              {' · '}
              {hover.day.longest_no_earth_hours < 1 / 60
                ? 'Earth always in view'
                : `longest without Earth ${formatDuration(hover.day.longest_no_earth_hours)}`}
            </span>
            <span className="muted">Click to open these dates</span>
          </>
        ) : (
          <span className="muted">Point at a square to see that landing date</span>
        )}
      </div>
    </div>
  )
}

function Legend({ metric, starLabel }: { metric: CalendarMetric; starLabel: string }) {
  return (
    <div className="calendar-legend small muted">
      {metric === 'verdict' ? (
        <span className="calendar-legend-verdicts">
          {(['green', 'yellow', 'red'] as const).map((v) => (
            <span key={v} className="calendar-key">
              <span className="calendar-swatch" data-verdict={v} aria-hidden="true" />
              {VERDICT_LABEL[v]}
            </span>
          ))}
        </span>
      ) : (
        <span className="calendar-legend-scale">
          <span>{metric === 'both_from_start_hours' ? 'none' : '0%'}</span>
          <span
            className="calendar-legend-bar"
            style={{
              background: `linear-gradient(to right, ${LEGEND_STOPS.map(colorFor).join(', ')})`,
            }}
            aria-hidden="true"
          />
          <span>{metric === 'both_from_start_hours' ? 'whole mission' : '100%'}</span>
        </span>
      )}
      <span className="calendar-key">
        <span className="calendar-key-here" aria-hidden="true" /> the date above
      </span>
      <span className="calendar-key">
        <span className="calendar-key-best" aria-hidden="true">
          ★
        </span>{' '}
        {starLabel}
      </span>
    </div>
  )
}

function Summary({
  calendar,
  metric,
  mission,
  starIndex,
  onOpen,
}: {
  calendar: CalendarResponse
  metric: CalendarMetric
  mission: Mission
  starIndex: number | null
  onOpen: (day: CalendarDay) => void
}) {
  const { days } = calendar
  const here = days[0]
  const caption = MISSIONS.find((m) => m.key === mission)!.caption

  if (metric !== 'verdict') {
    const label = CALENDAR_METRICS.find((m) => m.key === metric)!.label
    const best = starIndex === null ? null : days[starIndex]
    if (
      !best ||
      score(best, metric, calendar.mission_hours) - score(here, metric, calendar.mission_hours) < 1
    ) {
      return (
        <div className="calendar-summary">
          <p>
            No date in this range does better than the one above: {label}{' '}
            {formatValue(here, metric)}.
          </p>
        </div>
      )
    }
    return (
      <div className="calendar-summary">
        <p>
          Landing on <strong>{formatDay(best.start)}</strong> ({daysLater(starIndex!)}): {label}{' '}
          <strong>{formatValue(best, metric)}</strong> instead of {formatValue(here, metric)}.{' '}
          <button type="button" className="link-button" onClick={() => onOpen(best)}>
            Open that date
          </button>
        </p>
      </div>
    )
  }

  const { counts, windows, firstViable } = verdictSummary(days, mission)
  const hereVerdict = here.verdicts[mission]
  return (
    <div className="calendar-summary">
      <p>
        {firstViable === null ? (
          <>
            No landing date in this range is viable for a {caption}
            {counts.yellow > 0 ? `; ${counts.yellow} of ${days.length} are marginal.` : '.'}
          </>
        ) : hereVerdict === 'green' ? (
          <>
            The date above is viable for a {caption}, and so are{' '}
            <strong>
              {counts.green} of {days.length}
            </strong>{' '}
            landing dates in this range.
          </>
        ) : (
          <>
            The date above is {VERDICT_LABEL[hereVerdict].toLowerCase()} for a {caption}. The next
            viable landing date is <strong>{formatDay(days[firstViable].start)}</strong> (
            {daysLater(firstViable)}).{' '}
            <button type="button" className="link-button" onClick={() => onOpen(days[firstViable])}>
              Open that date
            </button>
          </>
        )}
      </p>
      {windows.length > 0 && (
        <p className="calendar-windows">
          <span className="muted">Landing windows:</span>
          {windows.slice(0, MAX_WINDOWS_SHOWN).map((w) => (
            <button
              key={w.from}
              type="button"
              className="chip-button"
              title={`${w.to - w.from + 1} viable landing date${w.to > w.from ? 's' : ''}; open the first`}
              onClick={() => onOpen(days[w.from])}
            >
              {formatRange(days[w.from].start, days[w.to].start)}
            </button>
          ))}
          {windows.length > MAX_WINDOWS_SHOWN && (
            <span className="muted">+{windows.length - MAX_WINDOWS_SHOWN} more</span>
          )}
        </p>
      )}
    </div>
  )
}

/** "The launch slipped: which landing date works now?" — the same mission on every date ahead. */
export function LandingCalendar({ scenario, onOpenDates }: Props) {
  const ownMs = scenarioMs(scenario.request)
  const [requested, setRequested] = useState(false)
  const [metric, setMetric] = useState<CalendarMetric>('verdict')
  const [missionMs, setMissionMs] = useState(() => defaultMissionMs(ownMs))
  const [spanDays, setSpanDays] = useState(DEFAULT_SPAN_DAYS)
  const { mission } = useMission()

  const request = useMemo(
    () => calendarRequest(scenario.request, missionMs, spanDays),
    [scenario.request, missionMs, spanDays],
  )
  const calendar = useCalendar(request, requested)
  const rows = useMemo(() => monthRows(calendar.data?.days ?? []), [calendar.data])
  const options = missionOptions(ownMs)
  const spanLabel = SPAN_OPTIONS.find((s) => s.days === spanDays)!.label
  const caption = MISSIONS.find((m) => m.key === mission)!.caption

  const starIndex = !calendar.data
    ? null
    : metric === 'verdict'
      ? verdictSummary(calendar.data.days, mission).firstViable
      : bestIndex(calendar.data, metric)
  const open = (day: CalendarDay) => onOpenDates(day.start, day.end)
  const coarser =
    calendarStepMinutes(scenario.request.step_minutes) !== scenario.request.step_minutes

  return (
    <section className="calendar" aria-labelledby="calendar-title">
      <h3 id="calendar-title" className="section-title">
        Better landing dates?
      </h3>
      <p className="muted small">
        A launch that slips moves the landing date, and on the Moon two weeks can decide between
        sunlight and darkness. The calendar lands the same mission at this site on every date ahead
        and shows what each one gets.
      </p>

      {!requested && (
        <button type="button" className="secondary" onClick={() => setRequested(true)}>
          Show the calendar
        </button>
      )}

      {requested && (
        <div className="calendar-controls">
          <label className="field">
            <span>Mission length</span>
            <select
              className="speed-select"
              value={missionMs}
              onChange={(e) => setMissionMs(Number(e.target.value))}
            >
              {options.map((o) => (
                <option key={o.ms} value={o.ms}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Landing dates</span>
            <select
              className="speed-select"
              value={spanDays}
              onChange={(e) => setSpanDays(Number(e.target.value))}
            >
              {SPAN_OPTIONS.map((s) => (
                <option key={s.days} value={s.days}>
                  Next {s.label}
                </option>
              ))}
            </select>
          </label>
          {calendar.isFetching && calendar.data && <Spinner label="Updating…" />}
        </div>
      )}

      {requested && calendar.isPending && (
        <Spinner
          label={`Asking JPL Horizons for ${spanLabel} of Sun and Earth positions… a few seconds the first time`}
        />
      )}

      {calendar.isError && (
        <div className="error-card" role="alert">
          <p>
            <strong>Could not build the calendar.</strong> {calendar.error.message}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => calendar.refetch()}
            disabled={calendar.isFetching}
          >
            {calendar.isFetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {calendar.data && !calendar.isError && (
        <>
          <div className="segmented calendar-metrics" role="group" aria-label="Calendar shows">
            {CALENDAR_METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={metric === m.key}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Summary
            calendar={calendar.data}
            metric={metric}
            mission={mission}
            starIndex={starIndex}
            onOpen={open}
          />
          <Grid
            calendar={calendar.data}
            rows={rows}
            metric={metric}
            mission={mission}
            starIndex={starIndex}
            onOpen={open}
          />
          <Legend
            metric={metric}
            starLabel={metric === 'verdict' ? 'next viable date' : 'best date'}
          />
          <p className="muted small">
            Every square is a {formatDuration(calendar.data.mission_hours)} mission that lands at{' '}
            {formatUtc(calendar.data.days[0].start).slice(11)} on that day.{' '}
            {metric === 'verdict' &&
              (mission === 'lunar_day'
                ? 'A day-only mission is judged from touchdown: it needs the Sun and the Earth when it lands, so a date just before sunrise is red even if the days after it are good. '
                : `Judged as a ${caption}. `)}
            {calendar.data.horizon_kind === 'terrain'
              ? 'The skyline is the same LOLA terrain as above.'
              : 'Flat horizon: no terrain data for this site.'}
            {coarser &&
              ` Sampled every ${calendar.data.step_minutes / 60} h, so the numbers can differ slightly from a finer analysis.`}
          </p>
        </>
      )}
    </section>
  )
}
