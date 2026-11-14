import { useQueries } from '@tanstack/react-query'
import { analysisQuery } from '../../api/queries'
import { formatDuration, formatUtc } from '../../lib/time'
import { MISSIONS, missionVerdict } from '../mission/mission'
import { useMission } from '../mission/useMission'
import type { Scenario } from '../scenario/scenario'

const VERDICT_LABEL = { green: 'Viable', yellow: 'Marginal', red: 'Not viable' } as const

/** A subtitle for the show, with the scene number. Remounted per caption, so it fades in. */
export function DemoCaption({ text, step, total }: { text: string; step: number; total: number }) {
  return (
    <div className="mc-caption" role="status" aria-live="polite">
      <span className="mc-caption-step">
        {step + 1} / {total}
      </span>
      <span className="mc-caption-text">{text}</span>
    </div>
  )
}

/** The end of the show: the three sites side by side over the same dates. */
export function DemoSummary({
  scenarios,
  onReplay,
  onPlanner,
}: {
  scenarios: Scenario[]
  onReplay: () => void
  onPlanner: () => void
}) {
  const { mission } = useMission()
  const caption = MISSIONS.find((m) => m.key === mission)!.caption
  // Same query keys as everywhere else: the show has already loaded all three.
  const results = useQueries({ queries: scenarios.map((s) => analysisQuery(s.request)) })
  const first = scenarios[0]?.request

  return (
    <div className="mc-summary-backdrop">
      <section className="mc-summary mc-panel" aria-label="Show summary">
        <p className="mc-summary-kicker">Same lunar day, three polar sites</p>
        {first && (
          <p className="mc-muted">
            {formatUtc(first.start)} → {formatUtc(first.end)} · verdict for a {caption}
          </p>
        )}
        <table className="mc-summary-table">
          <thead>
            <tr>
              <th scope="col">Site</th>
              <th scope="col">Verdict</th>
              <th scope="col">Sunlight</th>
              <th scope="col">Earth in view</th>
              <th scope="col">Sun + Earth</th>
              <th scope="col">Longest night</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => {
              const data = results[i]?.data
              if (!data) {
                return (
                  <tr key={s.key}>
                    <th scope="row">{s.name}</th>
                    <td colSpan={5} className="mc-muted">
                      Loading…
                    </td>
                  </tr>
                )
              }
              const m = data.metrics
              const v = missionVerdict(m, mission)
              return (
                <tr key={s.key}>
                  <th scope="row">{s.name}</th>
                  <td>
                    <span className="mc-summary-verdict" data-verdict={v.verdict}>
                      <span className="verdict-dot" aria-hidden="true" />
                      {VERDICT_LABEL[v.verdict]}
                    </span>
                  </td>
                  <td>{m.sunlit_pct.toFixed(0)}%</td>
                  <td>{m.earth_visible_pct.toFixed(0)}%</td>
                  <td>{m.both_pct.toFixed(0)}%</td>
                  <td>{formatDuration(m.longest_dark_hours)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mc-summary-note">
          A few kilometres or a few weeks change everything. Compare any sites and dates in the
          planner.
        </p>
        <div className="mc-summary-actions">
          <button type="button" className="secondary" onClick={onReplay}>
            ↺ Replay the show
          </button>
          <button type="button" className="primary" onClick={onPlanner}>
            Open the planner
          </button>
        </div>
      </section>
    </div>
  )
}
