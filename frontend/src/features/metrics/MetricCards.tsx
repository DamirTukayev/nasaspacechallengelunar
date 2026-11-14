import type { AnalyzeResponse } from '../../api/types'
import { formatDuration, formatUtc } from '../../lib/time'
import { type BodyStatus, formatCountdown, statusAt } from './countdown'

interface Props {
  analysis: AnalyzeResponse
  index: number
}

export function Hint({ text }: { text: string }) {
  return (
    <span className="hint" tabIndex={0} role="note" aria-label={text} title={text}>
      ?
    </span>
  )
}

function countdownText(status: BodyStatus, body: 'Sun' | 'Earth'): string {
  const verb =
    body === 'Sun'
      ? status.event === 'set'
        ? 'Sunset'
        : 'Sunrise'
      : status.event === 'set'
        ? 'Earthset'
        : 'Earthrise'
  return status.at
    ? `${verb} in ${formatCountdown(status.msUntil)}`
    : `No ${verb.toLowerCase()} in the next ${formatCountdown(status.msUntil)}`
}

/** What the Sun and the Earth are doing at the cursor, and how long that lasts. */
export function NowCards({ analysis, index }: Props) {
  const { series, windows } = analysis
  const t = Date.parse(series.times[index])
  const end = Date.parse(series.times[series.times.length - 1])

  const sun = statusAt(windows.sun, t, end)
  const earth = statusAt(windows.earth, t, end)
  const both = statusAt(windows.both, t, end)
  const disk = series.sun.visible_fraction[index]

  // Below this many hours the countdown is shown as urgent.
  const SOON_MS = 24 * 3_600_000

  return (
    <div className="now-cards">
      <article className="now-card" data-body="sun" data-up={sun.up}>
        <header>
          <span className="now-icon" aria-hidden="true">
            ☀
          </span>
          <h3>{sun.up ? 'Sun up' : 'Sun down'}</h3>
          <Hint text="The Sun counts as up while any part of its disk clears the local skyline (terrain included). Solar panels need it up." />
        </header>
        <p className="countdown" data-soon={sun.at !== null && sun.msUntil < SOON_MS}>
          {countdownText(sun, 'Sun')}
        </p>
        <p className="muted small">
          {sun.at ? `${sun.event === 'set' ? 'Sets' : 'Rises'} ${formatUtc(sun.at)} · ` : ''}
          elevation {series.sun.elevation[index].toFixed(1)}°
          {sun.up && disk < 1 ? ` · ${(disk * 100).toFixed(0)}% of disk visible` : ''}
        </p>
      </article>

      <article className="now-card" data-body="earth" data-up={earth.up}>
        <header>
          <span className="now-icon" aria-hidden="true">
            ◉
          </span>
          <h3>{earth.up ? 'Earth in view' : 'No Earth link'}</h3>
          <Hint text="Direct-to-Earth radio needs the Earth above the local skyline. Without it the lander needs a relay satellite." />
        </header>
        <p className="countdown" data-soon={earth.at !== null && earth.msUntil < SOON_MS}>
          {countdownText(earth, 'Earth')}
        </p>
        <p className="muted small">
          {earth.at ? `${earth.event === 'set' ? 'Sets' : 'Rises'} ${formatUtc(earth.at)} · ` : ''}
          elevation {series.earth.elevation[index].toFixed(1)}°
        </p>
      </article>

      <article className="now-card" data-body="both" data-up={both.up}>
        <header>
          <span className="now-icon" aria-hidden="true">
            ⇄
          </span>
          <h3>{both.up ? 'Power + link' : 'Not both'}</h3>
          <Hint text="Sunlight and a direct Earth link at the same time: the lander can both charge and send data." />
        </header>
        <p className="countdown" data-soon={both.at !== null && both.msUntil < SOON_MS}>
          {both.up
            ? both.at
              ? `Window closes in ${formatCountdown(both.msUntil)}`
              : `Open for the next ${formatCountdown(both.msUntil)}`
            : both.at
              ? `Next window in ${formatCountdown(both.msUntil)}`
              : 'No window left in range'}
        </p>
        <p className="muted small">{both.at ? formatUtc(both.at) : ' '}</p>
      </article>
    </div>
  )
}

/** Totals for the whole scenario. */
export function TotalCards({ analysis }: { analysis: AnalyzeResponse }) {
  const m = analysis.metrics
  const items = [
    {
      label: 'Sunlight',
      value: `${m.sunlit_pct.toFixed(0)}%`,
      hint: 'Share of the time range with any part of the Sun above the skyline.',
    },
    {
      label: 'Earth in view',
      value: `${m.earth_visible_pct.toFixed(0)}%`,
      hint: 'Share of the time range with the Earth above the skyline — direct radio contact possible.',
    },
    {
      label: 'Sun + Earth',
      value: `${m.both_pct.toFixed(0)}%`,
      hint: 'Share of the time with both sunlight and a direct Earth link.',
    },
    {
      label: 'Longest darkness',
      value: formatDuration(m.longest_dark_hours),
      hint: 'Longest stretch without the Sun. Batteries and heaters must carry the lander through it.',
    },
    {
      label: 'Longest without Earth',
      value: formatDuration(m.longest_no_earth_hours),
      hint: 'Longest stretch with no direct line of sight to the Earth.',
    },
    {
      label: 'Longest Sun + Earth',
      value: formatDuration(m.longest_both_hours ?? 0),
      hint: 'Longest stretch with power and a direct link together. A lunar-day mission needs about 10 days of it.',
    },
  ]

  return (
    <dl className="stats">
      {items.map((item) => (
        <div key={item.label}>
          <dt>
            {item.label} <Hint text={item.hint} />
          </dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
