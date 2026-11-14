import { useQueries } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { AnalyzeResponse } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { formatUtc } from '../../lib/time'
import type { Scenario } from '../scenario/scenario'
import { WindowStrip } from './WindowStrip'
import { METRIC_ROWS, bestIndices, bestVerdicts } from './compare'

const VERDICT_LABEL = { green: 'Viable', yellow: 'Marginal', red: 'Not viable' } as const

interface Props {
  scenarios: Scenario[]
  onOpen: (scenario: Scenario) => void
  onRemove: (key: string) => void
}

export function ComparisonView({ scenarios, onOpen, onRemove }: Props) {
  // Same query keys as the details view, so analyses already run are reused.
  const results = useQueries({
    queries: scenarios.map((s) => ({
      queryKey: ['analyze', s.request],
      queryFn: () => api.analyze(s.request),
      staleTime: Infinity,
      retry: false,
    })),
  })

  if (scenarios.length < 2) {
    return (
      <section className="panel compare-empty">
        <h2>Compare scenarios</h2>
        <p className="muted">
          Add at least two scenarios with <strong>+ Compare</strong> — different sites on the same
          dates, or the same site on different dates — to see them side by side.
        </p>
      </section>
    )
  }

  const data: (AnalyzeResponse | null)[] = results.map((r) => r.data ?? null)
  const verdictBest = bestVerdicts(data.map((d) => d?.metrics.verdict ?? null))

  return (
    <section className="panel compare" aria-label="Scenario comparison">
      <h2>Compare scenarios</h2>
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col" className="compare-corner">
                <span className="visually-hidden">Metric</span>
              </th>
              {scenarios.map((s) => (
                <th key={s.key} scope="col">
                  <div className="compare-head">
                    <span className="compare-name">{s.name}</span>
                    <span className="muted small">
                      {formatUtc(s.request.start).slice(0, 10)} →{' '}
                      {formatUtc(s.request.end).slice(0, 10)}
                    </span>
                    <span className="compare-actions">
                      <button type="button" className="link-button" onClick={() => onOpen(s)}>
                        Details
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        aria-label={`Remove ${s.name} from comparison`}
                        onClick={() => onRemove(s.key)}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Verdict</th>
              {scenarios.map((s, i) => {
                const result = results[i]
                const d = data[i]
                return (
                  <td key={s.key} data-best={verdictBest.has(i)}>
                    {result.isPending && <Spinner label="Analyzing…" />}
                    {result.isError && (
                      <span className="error small" role="alert">
                        {result.error.message}
                      </span>
                    )}
                    {d && (
                      <span className="compare-verdict" data-verdict={d.metrics.verdict}>
                        <span className="verdict-dot" aria-hidden="true" />
                        {VERDICT_LABEL[d.metrics.verdict]}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>

            {METRIC_ROWS.map((row) => {
              const values = data.map((d) => (d ? row.value(d.metrics) : null))
              const best = bestIndices(values, row.better)
              return (
                <tr key={row.key}>
                  <th scope="row" title={row.hint}>
                    {row.label}
                  </th>
                  {scenarios.map((s, i) => {
                    const v = values[i]
                    return (
                      <td key={s.key} data-best={best.has(i)}>
                        {v === null ? '—' : row.format(v)}
                        {best.has(i) && <span className="visually-hidden"> (best)</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            <tr>
              <th scope="row" title="Sun, Earth and both lanes over each scenario's own range">
                Windows
              </th>
              {scenarios.map((s, i) => {
                const d = data[i]
                return <td key={s.key}>{d ? <WindowStrip analysis={d} /> : '—'}</td>
              })}
            </tr>

            <tr>
              <th scope="row">Horizon</th>
              {scenarios.map((s, i) => {
                const d = data[i]
                return (
                  <td key={s.key} className="small">
                    {d
                      ? d.horizon_kind === 'terrain'
                        ? `Terrain · ${d.site_alt_m?.toFixed(0)} m`
                        : 'Flat (no terrain)'
                      : '—'}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Highlighted: best value in each row. Window lanes are drawn over each scenario's own dates.
      </p>
    </section>
  )
}
