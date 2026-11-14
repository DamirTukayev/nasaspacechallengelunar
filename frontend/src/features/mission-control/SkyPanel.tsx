import type { AnalyzeResponse } from '../../api/types'
import { formatDuration, formatUtc } from '../../lib/time'

const fmt = (n: number) => n.toLocaleString('en-US')

/** What the sky dome is drawn from: every number comes from the analysis response. */
export function SkyPanel({ analysis }: { analysis: AnalyzeResponse }) {
  const { series } = analysis
  const n = series.times.length
  const sunUp = series.sun.visible_fraction.filter((f) => f > 0).length
  const earthUp = series.earth.visible.filter(Boolean).length
  const hours = (Date.parse(series.times[n - 1]) - Date.parse(series.times[0])) / 3_600_000

  return (
    <div className="mc-tracing mc-sky mc-panel" role="status">
      <p className="mc-tracing-title">Sun and Earth paths · JPL Horizons</p>
      <dl className="mc-tracing-stats">
        <div>
          <dt>Positions</dt>
          <dd>
            {fmt(n)}
            <span className="mc-muted"> Sun + {fmt(n)} Earth</span>
          </dd>
        </div>
        <div>
          <dt>Above the skyline</dt>
          <dd>
            {fmt(sunUp)}
            <span className="mc-muted"> Sun · </span>
            {fmt(earthUp)}
            <span className="mc-muted"> Earth</span>
          </dd>
        </div>
        <div>
          <dt>Period from {formatUtc(series.times[0]).slice(0, 10)}</dt>
          <dd>{formatDuration(hours)}</dd>
        </div>
      </dl>
    </div>
  )
}
