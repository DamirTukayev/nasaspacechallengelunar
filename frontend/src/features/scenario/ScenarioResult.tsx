import { Suspense, lazy, useState } from 'react'
import { useAnalysis, useHorizon } from '../../api/queries'
import type { AnalyzeResponse } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { formatUtc } from '../../lib/time'
import { NowCards, TotalCards } from '../metrics/MetricCards'
import { useMission } from '../mission/useMission'
import { MISSIONS, missionVerdict } from '../mission/mission'
import { SkyPanorama } from '../sky/SkyPanorama'
import { Timeline } from '../timeline/Timeline'
import { usePlayback } from '../timeline/usePlayback'
import type { Scenario } from './scenario'

// three.js is large; load the 3D view only when someone opens it.
const SiteScene = lazy(() => import('../scene3d/SiteScene'))

const VERDICT_LABEL = { green: 'Viable', yellow: 'Marginal', red: 'Not viable' } as const

/**
 * Everything that follows the cursor in time: countdowns, the sky and the timeline.
 * Keyed by scenario, so switching scenarios starts again from the beginning.
 */
function MomentView({ scenario, analysis }: { scenario: Scenario; analysis: AnalyzeResponse }) {
  const horizon = useHorizon({ lat: scenario.request.lat, lon: scenario.request.lon })
  const [speedDays, setSpeedDays] = useState(1)
  const [skyMode, setSkyMode] = useState<'panorama' | '3d'>('panorama')
  const samplesPerSecond = (speedDays * 1440) / scenario.request.step_minutes
  const playback = usePlayback(analysis.series.times.length, samplesPerSecond)
  const { series } = analysis

  return (
    <section className="sky-view" aria-labelledby="moment-title">
      <h3 id="moment-title" className="section-title">
        At {formatUtc(analysis.series.times[playback.index])}
      </h3>

      <NowCards analysis={analysis} index={playback.index} />

      <div className="segmented" role="group" aria-label="Sky view">
        <button
          type="button"
          aria-pressed={skyMode === 'panorama'}
          onClick={() => setSkyMode('panorama')}
        >
          Sky panorama
        </button>
        <button type="button" aria-pressed={skyMode === '3d'} onClick={() => setSkyMode('3d')}>
          3D site
        </button>
      </div>

      {skyMode === 'panorama' ? (
        <>
          {horizon.isPending && <Spinner label="Computing the skyline from terrain…" />}
          {horizon.isError && (
            <p className="error" role="alert">
              Could not load the skyline: {horizon.error.message}
            </p>
          )}
          {horizon.data && (
            <SkyPanorama horizon={horizon.data} series={analysis.series} index={playback.index} />
          )}
        </>
      ) : (
        <Suspense fallback={<Spinner label="Loading the 3D view…" />}>
          <SiteScene
            site={{ lat: scenario.request.lat, lon: scenario.request.lon }}
            sun={{
              az: series.sun.azimuth[playback.index],
              el: series.sun.elevation[playback.index],
              visible: series.sun.visible_fraction[playback.index] > 0,
            }}
            earth={{
              az: series.earth.azimuth[playback.index],
              el: series.earth.elevation[playback.index],
              visible: series.earth.visible[playback.index],
            }}
          />
        </Suspense>
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
  const { mission } = useMission()
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
  const verdict = missionVerdict(m, mission)
  const missionCaption = MISSIONS.find((x) => x.key === mission)!.caption
  return (
    <section className="panel result">
      {header}
      <div className="verdict" data-verdict={verdict.verdict}>
        <span className="verdict-dot" aria-hidden="true" />
        <div>
          <span className="verdict-label">{VERDICT_LABEL[verdict.verdict]}</span>
          <span className="verdict-mission">for a {missionCaption}</span>
          <ul>
            {verdict.reasons.map((reason) => (
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
