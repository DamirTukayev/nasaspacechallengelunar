import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useSceneQuality } from '../scene3d/useSceneQuality'
import type { QualityChoice } from '../scene3d/quality'
import { initialLandingQuality } from './renderQuality'
import { type FrameInfo, MissionScene } from './MissionScene'
import {
  type DataSource,
  type SelectedLandingSearch,
  STAGES,
  formatLat,
  formatLon,
  rampCss,
  scannedCount,
  sweepFraction,
} from './landing'

export type AnimationLoad =
  | { state: 'loading' }
  | { state: 'ready'; data: SelectedLandingSearch; source: DataSource }
  | { state: 'error'; message: string }
  | { state: 'empty' }

const IDLE: FrameInfo = { playing: false, done: false, stageIndex: -1, progress: 0, sweep: 0 }

const SCORE_ROWS = [
  { key: 'terrain', label: 'Terrain & slope' },
  { key: 'light', label: 'Illumination' },
  { key: 'comm', label: 'Earth link' },
  { key: 'resources', label: 'Resources' },
] as const

/** `?t=40` in the URL starts the mission 40 s in, to rehearse a single stage. */
function startOffset(): number {
  const t = Number(new URLSearchParams(window.location.search).get('t'))
  return Number.isFinite(t) && t > 0 ? t : 0
}

function pct(v: number) {
  return `${Math.round(v)}%`
}

function Readout({ data, frame }: { data: SelectedLandingSearch; frame: FrameInfo }) {
  const p = data.points
  const fracs = useMemo(() => p.x_km.map((x, i) => sweepFraction(x, p.y_km[i])), [p.x_km, p.y_km])
  const order = useMemo(
    () => fracs.map((f, i) => [f, i] as const).sort((a, b) => a[0] - b[0]),
    [fracs],
  )
  const stage = STAGES[frame.stageIndex]
  if (!stage) return null

  const total = p.x_km.length
  const scanned = stage.field ? Math.min(total, scannedCount(fracs, frame.sweep)) : 0
  const probe = scanned > 0 ? order[scanned - 1][1] : data.best

  let rows: [string, string][] = []
  switch (stage.id) {
    case 'focus':
      rows = [
        ['Target', 'Lunar south pole'],
        ['Search radius', `${data.radius_km} km`],
        ['Grid', `${total} sites · ${data.spacing_km} km`],
      ]
      break
    case 'terrain':
      rows = [
        ['Slope', `${p.slope_deg[probe].toFixed(1)}°`],
        ['Elevation', `${Math.round(p.alt_m[probe])} m`],
        ['Safe ≤', `${data.thresholds.max_slope_deg}°`],
      ]
      break
    case 'light':
      rows = [
        ['Sunlit', pct(p.sunlit_pct[probe])],
        ['Longest night', `${Math.round(p.longest_dark_h[probe] / 24)} d`],
        ['Needed ≥', pct(data.thresholds.min_sunlit_pct)],
      ]
      break
    case 'comm':
      rows = [
        ['Earth in view', pct(p.earth_pct[probe])],
        ['Link', p.earth_pct[probe] > 0 ? 'direct' : 'relay needed'],
      ]
      break
    case 'resources':
      rows = [
        ['Hydrogen', `${Math.round(p.hydrogen_ppm[probe])} ppm`],
        [
          'Cold trap',
          p.cold_trap[probe] ? 'inside' : `${p.cold_trap_km[probe].toFixed(0)} km away`,
        ],
        ['Cold traps found', String(p.cold_trap.filter(Boolean).length)],
      ]
      break
    case 'select':
      rows = [
        ['Eligible sites', `${p.eligible.filter(Boolean).length} / ${total}`],
        ['Best score', p.total[data.best].toFixed(2)],
        ['Site', `${formatLat(p.lat[data.best])} ${formatLon(p.lon[data.best])}`],
      ]
      break
    default:
      rows = [
        ['Site', `${formatLat(p.lat[data.best])} ${formatLon(p.lon[data.best])}`],
        ['Elevation', `${Math.round(p.alt_m[data.best])} m`],
        ['Slope', `${p.slope_deg[data.best].toFixed(1)}°`],
      ]
  }

  return (
    <div className="mission-readout">
      <p className="mission-kicker">{stage.label}</p>
      {stage.field && (
        <p className="mission-counter">
          <span>{scanned}</span> / {total} sites scanned
        </p>
      )}
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {stage.field && (
        <div className="mission-legend" aria-hidden="true">
          <span>low</span>
          <i
            style={{
              background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(rampCss).join(', ')})`,
            }}
          />
          <span>high</span>
        </div>
      )}
    </div>
  )
}

function FinalCard({
  data,
  source,
  onReplay,
}: {
  data: SelectedLandingSearch
  source: DataSource
  onReplay: () => void
}) {
  const p = data.points
  const i = data.best
  const raw: Record<(typeof SCORE_ROWS)[number]['key'], string> = {
    terrain: `${p.slope_deg[i].toFixed(1)}° slope`,
    light: `${pct(p.sunlit_pct[i])} sunlit`,
    comm: `${pct(p.earth_pct[i])} Earth in view`,
    resources: `${Math.round(p.hydrogen_ppm[i])} ppm H`,
  }
  return (
    <div className="mission-final">
      <span className="badge">Touchdown</span>
      <h2 className="mission-final-title" style={{ textShadow: 'none' }}>
        {formatLat(p.lat[i])} {formatLon(p.lon[i])}
      </h2>
      <p className="muted">
        Score {p.total[i].toFixed(2)} · best of {p.eligible.filter(Boolean).length} eligible sites ·
        elevation {Math.round(p.alt_m[i])} m
      </p>
      <ul className="mission-bars">
        {SCORE_ROWS.map(({ key, label }) => {
          const value = p[`score_${key}`][i]
          return (
            <li key={key}>
              <span>{label}</span>
              <i>
                <b style={{ width: `${value * 100}%`, background: rampCss(value) }} />
              </i>
              <span className="mission-bar-raw">{raw[key]}</span>
            </li>
          )
        })}
      </ul>
      <p className="mission-sources">
        {source === 'live' ? 'Computed by the backend' : 'Precomputed by the backend'} for{' '}
        {data.period_start.slice(0, 10)} – {data.period_end.slice(0, 10)}. Data:{' '}
        {data.sources.map((s, k) => (
          <span key={s.url}>
            {k > 0 && ', '}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.name}
            </a>
          </span>
        ))}
        .
      </p>
      <Button variant="primary" onClick={onReplay}>
        Replay mission
      </Button>
    </div>
  )
}

export default function MissionView({ load }: { load: AnimationLoad }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<MissionScene | null>(null)
  const [frame, setFrame] = useState<FrameInfo>(IDLE)
  const { choice, setChoice, quality, sample } = useSceneQuality(initialLandingQuality)
  const sceneData = load.state === 'ready' ? load.data : null

  useEffect(() => {
    const container = stageRef.current
    if (!container) return
    const scene = new MissionScene(container, setFrame, { onFrameSample: sample })
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [sample])

  useEffect(() => {
    sceneRef.current?.setQuality(quality)
  }, [quality])

  useEffect(() => {
    if (sceneData) sceneRef.current?.setData(sceneData)
    else sceneRef.current?.reset()
  }, [sceneData])

  const ready = load.state === 'ready'
  const idle = !frame.playing && !frame.done

  return (
    <section className="mission ui-inverse" aria-label="Landing mission">
      <div className="mission-stage" ref={stageRef} />

      <div className="mission-top">
        <span className="mission-title" style={{ textShadow: 'none' }}>
          Mission · Lunar south pole
        </span>
        {ready && (
          <span className="mission-source" data-source={load.source}>
            {load.source === 'live' ? 'Computed by backend' : 'Saved calculation'}
          </span>
        )}
        <label className="landing-quality">
          Quality
          <select
            aria-label="Landing search quality"
            value={choice}
            onChange={(event) => setChoice(event.target.value as QualityChoice)}
          >
            <option value="auto">Auto ({quality})</option>
            <option value="high">High</option>
            <option value="balanced">Balanced</option>
            <option value="low">Simplified</option>
          </select>
        </label>
      </div>

      {(frame.playing || frame.done) && (
        <ol className="mission-steps">
          {STAGES.map((stage, k) => {
            const state =
              frame.done || k < frame.stageIndex
                ? 'done'
                : k === frame.stageIndex
                  ? 'active'
                  : 'pending'
            return (
              <li key={stage.id} data-state={state}>
                <span className="mission-step-mark" aria-hidden="true">
                  {state === 'done' ? '✓' : k + 1}
                </span>
                <span className="mission-step-text">
                  <b>{stage.label}</b>
                  <small>
                    {ready && stage.id === 'focus'
                      ? `Lunar south pole, ${load.data.radius_km} km radius`
                      : ready && (stage.id === 'light' || stage.id === 'comm')
                        ? `${stage.detail.split(',')[0]}, ${Math.round((Date.parse(load.data.period_end) - Date.parse(load.data.period_start)) / 86400000)} days`
                        : stage.detail}
                  </small>
                  {state === 'active' && (
                    <i className="mission-step-bar">
                      <i style={{ width: `${frame.progress * 100}%` }} />
                    </i>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {ready && frame.playing && <Readout data={load.data} frame={frame} />}

      {idle && (
        <div className="mission-start">
          <h2 className="wordmark" style={{ textShadow: 'none' }}>
            Find the landing site
          </h2>
          <p>
            Scan the lunar south pole for terrain, sunlight, Earth link and water ice, then land.
          </p>
          <Button
            variant="primary"
            className="mission-start-button"
            disabled={!ready}
            onClick={() => sceneRef.current?.start(startOffset())}
          >
            {ready
              ? 'Start'
              : load.state === 'empty'
                ? 'No eligible sites'
                : load.state === 'error'
                  ? 'No data'
                  : 'Loading data…'}
          </Button>
          {load.state === 'empty' && (
            <p role="status">
              No sites meet the slope and sunlight limits for this period. Try other dates or a
              different area in the planner.
            </p>
          )}
          {load.state === 'error' && <p className="field-error">{load.message}</p>}
        </div>
      )}

      {ready && frame.done && (
        <FinalCard
          data={load.data}
          source={load.source}
          onReplay={() => sceneRef.current?.start()}
        />
      )}
    </section>
  )
}
