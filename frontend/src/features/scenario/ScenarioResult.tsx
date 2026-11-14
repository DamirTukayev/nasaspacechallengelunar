import { useAnalysis } from '../../api/queries'
import { formatDuration, formatUtc } from '../../lib/time'
import type { Scenario } from './scenario'

const VERDICT_LABEL = { green: 'Viable', yellow: 'Marginal', red: 'Not viable' } as const

/** Compact result of the analyzed scenario. Full metrics and charts come in F3–F5. */
export function ScenarioResult({ scenario }: { scenario: Scenario | null }) {
  const analysis = useAnalysis(scenario?.request ?? null)

  if (!scenario) {
    return (
      <section className="panel result">
        <p className="muted">Pick a site and dates, then press Analyze.</p>
      </section>
    )
  }

  const { request } = scenario
  const header = (
    <header className="result-header">
      <h2>{scenario.name}</h2>
      <p className="muted">
        {formatUtc(request.start)} → {formatUtc(request.end)}
      </p>
    </header>
  )

  if (analysis.isPending) {
    return (
      <section className="panel result" aria-busy="true">
        {header}
        <p className="muted">Querying JPL Horizons and the terrain model…</p>
      </section>
    )
  }

  if (analysis.isError) {
    return (
      <section className="panel result">
        {header}
        <p className="error" role="alert">
          {analysis.error.message}
        </p>
      </section>
    )
  }

  const { metrics: m, horizon_kind, site_alt_m } = analysis.data
  return (
    <section className="panel result">
      {header}
      <div className="verdict" data-verdict={m.verdict}>
        <span className="verdict-label">{VERDICT_LABEL[m.verdict]}</span>
        <ul>
          {m.verdict_reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      <dl className="stats">
        <div>
          <dt>Sunlight</dt>
          <dd>{m.sunlit_pct.toFixed(0)}%</dd>
        </div>
        <div>
          <dt>Earth in view</dt>
          <dd>{m.earth_visible_pct.toFixed(0)}%</dd>
        </div>
        <div>
          <dt>Both</dt>
          <dd>{m.both_pct.toFixed(0)}%</dd>
        </div>
        <div>
          <dt>Longest darkness</dt>
          <dd>{formatDuration(m.longest_dark_hours)}</dd>
        </div>
      </dl>

      <p className="muted small">
        {horizon_kind === 'terrain'
          ? `Horizon from LOLA terrain · site elevation ${site_alt_m?.toFixed(0)} m`
          : 'Flat horizon — no terrain data for this site'}
      </p>
    </section>
  )
}
