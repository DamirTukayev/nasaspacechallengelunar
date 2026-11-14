import { useState } from 'react'
import { useAnalysis, useHorizon } from '../../api/queries'
import type { AnalyzeResponse } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { formatUtc } from '../../lib/time'
import { NowCards, TotalCards } from '../metrics/MetricCards'
import { SkyPanorama } from '../sky/SkyPanorama'
import { Timeline } from '../timeline/Timeline'
import { usePlayback } from '../timeline/usePlayback'
import type { Scenario } from './scenario'

const VERDICT_LABEL = { green: 'Viable', yellow: 'Marginal', red: 'Not viable' } as const

/**
 * Everything that follows the cursor in time: countdowns, the sky and the timeline.
 * Keyed by scenario, so switching scenarios starts again from the beginning.
 */
function MomentView({ scenario, analysis }: { scenario: Scenario; analysis: AnalyzeResponse }) {
  const horizon = useHorizon({ lat: scenario.request.lat, lon: scenario.request.lon })
  const [speedDays, setSpeedDays] = useState(1)
  const samplesPerSecond = (speedDays * 1440) / scenario.request.step_minutes
  const playback = usePlayback(analysis.series.times.length, samplesPerSecond)

  return (
    <section className="sky-view" aria-labelledby="moment-title">
      <h3 id="moment-title" className="section-title">
        At {formatUtc(analysis.series.times[playback.index])}
      </h3>

      <NowCards analysis={analysis} index={playback.index} />

      {horizon.isPending && <Spinner label="Computing the skyline from terrain…" />}
      {horizon.isError && (
        <p className="error" role="alert">
          Could not load the skyline: {horizon.error.message}
        </p>
      )}
      {horizon.data && (
        <SkyPanorama horizon={horizon.data} series={analysis.series} index={playback.index} />
      )}

      <Timeline
        analysis={analysis}
        index={playback.index}
        playing={playback.playing}
        speedDays={speedDays}
        onSeek={playback.seek}
        onTogglePlay={playback.toggle}
        onSpeedChange={setSpeedDays}
      />
    </section>
  )
}

export function ScenarioResult({ scenario }: { scenario: Scenario }) {
  const analysis = useAnalysis(scenario.request)

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
        <Spinner label="Asking JPL Horizons where the Sun and Earth are…" />
        <p className="muted small">
          The first run for a site takes a few seconds; repeats are instant.
        </p>
      </section>
    )
  }

  if (analysis.isError) {
    return (
      <section className="panel result">
        {header}
        <div className="error-card" role="alert">
          <p>
            <strong>Analysis failed.</strong> {analysis.error.message}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => analysis.refetch()}
            disabled={analysis.isFetching}
          >
            {analysis.isFetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      </section>
    )
  }

  const { metrics: m, horizon_kind, site_alt_m } = analysis.data
  return (
    <section className="panel result">
      {header}
      <div className="verdict" data-verdict={m.verdict}>
        <span className="verdict-dot" aria-hidden="true" />
        <div>
          <span className="verdict-label">{VERDICT_LABEL[m.verdict]}</span>
          <ul>
            {m.verdict_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      </div>

      <TotalCards analysis={analysis.data} />

      <p className="muted small">
        {horizon_kind === 'terrain'
          ? `Horizon from LOLA terrain · site elevation ${site_alt_m?.toFixed(0)} m`
          : 'Flat horizon — no terrain data for this site'}
      </p>

      <MomentView key={scenario.key} scenario={scenario} analysis={analysis.data} />
    </section>
  )
}
