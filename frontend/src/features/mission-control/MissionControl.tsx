import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAnalysis, useTerrain } from '../../api/queries'
import type { AnalyzeResponse, Site, TerrainResponse } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { formatDuration, formatUtc } from '../../lib/time'
import { formatCountdown, statusAt } from '../metrics/countdown'
import { MISSIONS, missionVerdict } from '../mission/mission'
import { useMission } from '../mission/useMission'
import type { Scenario } from '../scenario/scenario'
import { SiteCanvas } from '../scene3d/SiteScene'
import type { Vec3 } from '../scene3d/math'
import { usePlayback } from '../timeline/usePlayback'
import { quickStartScenarios } from '../welcome/quickStarts'
import { HudTimeline } from './HudTimeline'
import { showScenarios } from './mode'
import { useMissionKeys } from './useMissionKeys'

const VERDICT_LABEL = { green: 'Viable', yellow: 'Marginal', red: 'Not viable' } as const
const SPEEDS = [
  { label: '½ day/s', days: 0.5 },
  { label: '1 day/s', days: 1 },
  { label: '3 days/s', days: 3 },
  { label: '1 week/s', days: 7 },
] as const
/** Wider than the in-page view: the whole screen is available. */
const FULLSCREEN_OVERVIEW: Vec3 = [15, 8, 20]

interface Props {
  sites: Site[]
  /** The scenario open in the planner, offered first. */
  current: Scenario | null
  /** Leave for the planner, with the scenario on screen. */
  onExit: (scenario: Scenario) => void
}

function formatLatLon(lat: number, lon: number): string {
  const ns = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}`
  const ew = `${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`
  return `${ns}, ${ew}`
}

function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false)
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void target.current?.requestFullscreen?.().catch(() => {})
  }, [target])
  return { active, toggle }
}

export default function MissionControl({ sites, current, onExit }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(rootRef)

  const options = useMemo(
    () => showScenarios(current, quickStartScenarios('polar-trio', sites).scenarios),
    [current, sites],
  )
  const [slot, setSlot] = useState(0)
  const scenario = options[Math.min(slot, options.length - 1)]

  // The page underneath must not scroll while the fullscreen view is up.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div className="mc" ref={rootRef} role="dialog" aria-modal="true" aria-label="Mission Control">
      {scenario && (
        <MissionStage
          key={scenario.key}
          scenario={scenario}
          options={options}
          slot={slot}
          onPick={(i) => i < options.length && setSlot(i)}
          fullscreen={fullscreen}
          onExit={() => {
            if (document.fullscreenElement) void document.exitFullscreen()
            onExit(scenario)
          }}
        />
      )}
    </div>
  )
}

interface StageProps {
  scenario: Scenario
  options: Scenario[]
  slot: number
  onPick: (slot: number) => void
  fullscreen: { active: boolean; toggle: () => void }
  onExit: () => void
}

/** One scenario on screen. Keyed by scenario, so switching sites lands again from the top. */
function MissionStage({ scenario, options, slot, onPick, fullscreen, onExit }: StageProps) {
  const { lat, lon } = scenario.request
  const analysis = useAnalysis(scenario.request)
  const terrain = useTerrain({ lat, lon })
  const ready = analysis.data && terrain.data

  return (
    <>
      {ready ? (
        <LiveStage
          scenario={scenario}
          analysis={analysis.data}
          terrain={terrain.data}
          options={options}
          slot={slot}
          onPick={onPick}
          fullscreen={fullscreen}
          onExit={onExit}
        />
      ) : (
        <div className="mc-loading">
          <HudTop
            scenario={scenario}
            options={options}
            slot={slot}
            onPick={onPick}
            time={null}
            fullscreen={fullscreen}
            onExit={onExit}
          />
          <div className="mc-loading-body">
            {analysis.isError || terrain.isError ? (
              <div className="mc-panel mc-error" role="alert">
                <p>
                  <strong>Could not prepare this site.</strong>{' '}
                  {(analysis.error ?? terrain.error)?.message}
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void analysis.refetch()
                    void terrain.refetch()
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <p className="mc-loading-title">{scenario.name}</p>
                <Spinner
                  label={
                    analysis.isPending
                      ? 'Asking JPL Horizons where the Sun and Earth are…'
                      : 'Loading LOLA terrain around the site…'
                  }
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

interface LiveProps {
  scenario: Scenario
  analysis: AnalyzeResponse
  terrain: TerrainResponse
  options: Scenario[]
  slot: number
  onPick: (slot: number) => void
  fullscreen: { active: boolean; toggle: () => void }
  onExit: () => void
}

function LiveStage({
  scenario,
  analysis,
  terrain,
  options,
  slot,
  onPick,
  fullscreen,
  onExit,
}: LiveProps) {
  const { series } = analysis
  const [speedDays, setSpeedDays] = useState(1)
  const samplesPerDay = 1440 / scenario.request.step_minutes
  const playback = usePlayback(series.times.length, speedDays * samplesPerDay)
  const [landed, setLanded] = useState(false)
  const [playId, setPlayId] = useState(0)

  // Once the lander is down, let the lunar day run by itself.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (landed && !autoStarted.current) {
      autoStarted.current = true
      if (!playback.playing) playback.toggle()
    }
  }, [landed, playback])

  useMissionKeys({
    togglePlay: playback.toggle,
    step: (n, big) => playback.seek(playback.index + n * (big ? samplesPerDay : 1)),
    pickSite: onPick,
    toggleFullscreen: fullscreen.toggle,
    exit: onExit,
  })

  const i = playback.index
  const sun = {
    az: series.sun.azimuth[i],
    el: series.sun.elevation[i],
    visible: series.sun.visible_fraction[i] > 0,
  }
  const earth = {
    az: series.earth.azimuth[i],
    el: series.earth.elevation[i],
    visible: series.earth.visible[i],
  }

  return (
    <>
      <div className="mc-canvas">
        <SiteCanvas
          terrain={terrain}
          sun={sun}
          earth={earth}
          playId={playId}
          landed={landed}
          onLanded={() => setLanded(true)}
          overview={FULLSCREEN_OVERVIEW}
        />
      </div>

      <div className="mc-hud">
        <HudTop
          scenario={scenario}
          options={options}
          slot={slot}
          onPick={onPick}
          time={series.times[i]}
          fullscreen={fullscreen}
          onExit={onExit}
        />
        <div className="mc-side mc-left">
          <SiteCard scenario={scenario} analysis={analysis} terrain={terrain} />
        </div>
        <div className="mc-side mc-right">
          <NowCard analysis={analysis} index={i} />
          <TotalsCard analysis={analysis} />
        </div>
        <div className="mc-bottom mc-panel">
          <div className="mc-controls">
            <button
              type="button"
              className="play-button"
              aria-pressed={playback.playing}
              aria-label={playback.playing ? 'Pause' : 'Play'}
              onClick={playback.toggle}
            >
              {playback.playing ? '❚❚' : '▶'}
            </button>
            <span className="mc-time">{formatUtc(series.times[i])}</span>
            <select
              className="speed-select"
              aria-label="Playback speed"
              value={speedDays}
              onChange={(e) => setSpeedDays(Number(e.target.value))}
            >
              {SPEEDS.map((s) => (
                <option key={s.days} value={s.days}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary mc-replay"
              disabled={!landed}
              onClick={() => {
                setLanded(false)
                setPlayId((n) => n + 1)
              }}
            >
              ↺ Landing
            </button>
          </div>
          <HudTimeline analysis={analysis} index={i} onSeek={playback.seek} />
          <p className="mc-keys" aria-hidden="true">
            <kbd>Space</kbd> play · <kbd>←</kbd>
            <kbd>→</kbd> time (<kbd>Shift</kbd> a day) · <kbd>1</kbd>–<kbd>{options.length}</kbd>{' '}
            sites · <kbd>F</kbd> fullscreen · <kbd>Esc</kbd> planner
          </p>
        </div>
      </div>
    </>
  )
}

function HudTop({
  scenario,
  options,
  slot,
  onPick,
  time,
  fullscreen,
  onExit,
}: {
  scenario: Scenario
  options: Scenario[]
  slot: number
  onPick: (slot: number) => void
  time: string | null
  fullscreen: { active: boolean; toggle: () => void }
  onExit: () => void
}) {
  return (
    <div className="mc-top">
      <div className="mc-brand">
        <span className="mc-brand-title">Lunar Site Planner</span>
        <span className="mc-brand-sub">Mission Control</span>
      </div>
      <nav className="mc-sites" aria-label="Landing sites">
        {options.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={i === slot}
            onClick={() => onPick(i)}
            title={`${s.name} (key ${i + 1})`}
          >
            <kbd>{i + 1}</kbd> {s.name}
          </button>
        ))}
      </nav>
      <div className="mc-top-right">
        <span className="mc-clock" aria-label="Mission time">
          {time ? formatUtc(time) : scenario.name}
        </span>
        <button type="button" className="secondary" onClick={fullscreen.toggle}>
          {fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        <button type="button" className="primary" onClick={onExit}>
          Open planner
        </button>
      </div>
    </div>
  )
}

function SiteCard({
  scenario,
  analysis,
  terrain,
}: {
  scenario: Scenario
  analysis: AnalyzeResponse
  terrain: TerrainResponse
}) {
  const { mission, setMission } = useMission()
  const verdict = missionVerdict(analysis.metrics, mission)
  const caption = MISSIONS.find((m) => m.key === mission)!.caption

  return (
    <section className="mc-panel mc-site" aria-label="Site and verdict">
      <h2>{scenario.name}</h2>
      <p className="mc-muted">
        {formatLatLon(scenario.request.lat, scenario.request.lon)}
        {terrain.kind === 'terrain' && terrain.site_alt_m !== null
          ? ` · ${terrain.site_alt_m >= 0 ? '+' : ''}${terrain.site_alt_m.toFixed(0)} m`
          : ''}
      </p>
      <p className="mc-muted">
        {terrain.kind === 'terrain'
          ? 'Skyline from LRO LOLA terrain, 200 km'
          : 'No terrain data: smooth sphere'}
      </p>

      <div className="mc-verdict" data-verdict={verdict.verdict}>
        <span className="verdict-dot" aria-hidden="true" />
        <div>
          <strong>{VERDICT_LABEL[verdict.verdict]}</strong>
          <span className="mc-muted"> for a {caption}</span>
          <ul>
            {verdict.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="segmented mc-mission" role="group" aria-label="Mission">
        {MISSIONS.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={mission === m.key}
            title={m.hint}
            onClick={() => setMission(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function NowCard({ analysis, index }: { analysis: AnalyzeResponse; index: number }) {
  const { series, windows } = analysis
  const t = Date.parse(series.times[index])
  const end = Date.parse(series.times[series.times.length - 1])
  const rows = [
    {
      key: 'sun',
      icon: '☀',
      status: statusAt(windows.sun, t, end),
      up: 'Sun up',
      down: 'Sun down',
      set: 'sets',
      rise: 'rises',
      detail: `${series.sun.elevation[index].toFixed(1)}°`,
    },
    {
      key: 'earth',
      icon: '◉',
      status: statusAt(windows.earth, t, end),
      up: 'Earth in view',
      down: 'No Earth link',
      set: 'sets',
      rise: 'rises',
      detail: `${series.earth.elevation[index].toFixed(1)}°`,
    },
    {
      key: 'both',
      icon: '⇄',
      status: statusAt(windows.both, t, end),
      up: 'Power + link',
      down: 'Not both',
      set: 'ends',
      rise: 'opens',
      detail: '',
    },
  ]

  return (
    <section className="mc-panel" aria-label="Now">
      <h3 className="mc-panel-title">Now</h3>
      <ul className="mc-now">
        {rows.map((r) => (
          <li key={r.key} data-body={r.key} data-up={r.status.up}>
            <span className="mc-now-icon" aria-hidden="true">
              {r.icon}
            </span>
            <span className="mc-now-state">{r.status.up ? r.up : r.down}</span>
            <span className="mc-now-detail">{r.detail}</span>
            <span className="mc-now-countdown">
              {r.status.at
                ? `${r.status.up ? r.set : r.rise} in ${formatCountdown(r.status.msUntil)}`
                : r.status.up
                  ? 'to the end'
                  : 'not again'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TotalsCard({ analysis }: { analysis: AnalyzeResponse }) {
  const m = analysis.metrics
  const items = [
    { label: 'Sunlight', value: `${m.sunlit_pct.toFixed(0)}%` },
    { label: 'Earth in view', value: `${m.earth_visible_pct.toFixed(0)}%` },
    { label: 'Sun + Earth', value: `${m.both_pct.toFixed(0)}%` },
    { label: 'Longest night', value: formatDuration(m.longest_dark_hours) },
  ]
  return (
    <section className="mc-panel" aria-label="Whole period">
      <h3 className="mc-panel-title">Whole period</h3>
      <dl className="mc-totals">
        {items.map((it) => (
          <div key={it.label}>
            <dt>{it.label}</dt>
            <dd>{it.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
