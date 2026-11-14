import {
  type RefObject,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNearby } from '../../api/nearby'
import { useAnalysis, useHorizon, useTerrain } from '../../api/queries'
import type { AnalyzeResponse, HorizonResponse, Site, TerrainResponse } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { formatDuration, formatUtc } from '../../lib/time'
import { formatCountdown, statusAt } from '../metrics/countdown'
import { MISSIONS, missionVerdict } from '../mission/mission'
import { useMission } from '../mission/useMission'
import type { Scenario } from '../scenario/scenario'
import { SiteCanvas } from '../scene3d/SiteScene'
import {
  type HeatLayer,
  SUNLIGHT_MAP_HALF_EXTENT_KM,
  SUNLIGHT_MAP_STEP_KM,
  runningCounts,
  sharesUntil,
} from '../scene3d/heat'
import type { Vec3 } from '../scene3d/math'
import { type Sight, describeSight, sightOf } from '../scene3d/sight'
import { usePlayback } from '../timeline/usePlayback'
import { quickStartScenarios } from '../welcome/quickStarts'
import { HudTimeline } from './HudTimeline'
import { type LiveMetrics, metricsUntil } from './live'
import { TracingPanel } from './TracingPanel'
import { DEMO_SCENES, type DemoScene, SCENE_HOLD_SECONDS } from './demo'
import { DemoCaption, DemoSummary } from './DemoParts'
import { DescentHud } from './DescentHud'
import { prefersReducedMotion, readIntroSeen, shouldFlyIn, storeIntroSeen } from './flyIn'
import { azElToGlobe } from './globe'
import { showScenarios } from './mode'
import { useMissionKeys } from './useMissionKeys'

const VERDICT_LABEL = { green: 'Viable', yellow: 'Marginal', red: 'Not viable' } as const
const SPEEDS = [
  { label: '½ day/s', days: 0.5 },
  { label: '1 day/s', days: 1 },
  { label: '2 days/s', days: 2 },
  { label: '3 days/s', days: 3 },
  { label: '1 week/s', days: 7 },
] as const
/** Wider than the in-page view: the whole screen is available. */
const FULLSCREEN_OVERVIEW: Vec3 = [15, 8, 20]

// The globe and its maps (~0.8 MB) load only when the flight is going to play.
const loadGlobeIntro = () => import('./GlobeIntro')
const GlobeIntro = lazy(loadGlobeIntro)

interface Props {
  sites: Site[]
  /** The scenario open in the planner, offered first. */
  current: Scenario | null
  /** Start the automatic show right away (`?demo=1`). */
  startDemo?: boolean
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

export default function MissionControl({ sites, current, onExit, startDemo = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(rootRef)

  const showcase = useMemo(() => quickStartScenarios('polar-trio', sites).scenarios, [sites])
  const options = useMemo(() => showScenarios(current, showcase), [current, showcase])
  const [slot, setSlot] = useState(0)

  // The automatic show: one step per scene, then a summary (step === scenes.length).
  const demoScenarios = useMemo(
    () =>
      DEMO_SCENES.map((scene) => showcase.find((s) => s.siteId === scene.siteId)).filter(
        (s): s is Scenario => s !== undefined,
      ),
    [showcase],
  )
  const [demoStep, setDemoStep] = useState<number | null>(
    startDemo && demoScenarios.length === DEMO_SCENES.length ? 0 : null,
  )
  const inScene = demoStep !== null && demoStep < demoScenarios.length

  // The flight from the whole Moon: once per browser, and at the start of the show.
  const [reducedMotion] = useState(prefersReducedMotion)
  const [introSeen, setIntroSeen] = useState(readIntroSeen)
  const flyIn = shouldFlyIn({ reducedMotion, seen: introSeen, demoStep })
  function markIntroSeen() {
    setIntroSeen(true)
    storeIntroSeen()
  }
  // Fetch the globe while the site data is still loading.
  useEffect(() => {
    if (flyIn) void loadGlobeIntro()
  }, [flyIn])
  const scenario =
    demoStep !== null
      ? demoScenarios[Math.min(demoStep, demoScenarios.length - 1)]
      : options[Math.min(slot, options.length - 1)]

  function toggleDemo() {
    setDemoStep((step) => (step === null && demoScenarios.length === DEMO_SCENES.length ? 0 : null))
  }

  function pick(i: number) {
    if (i >= options.length) return
    // Picking a site by hand ends the show.
    if (demoStep !== null) {
      setDemoStep(null)
      setSlot(i)
    } else setSlot(i)
  }

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
          sites={sites}
          flyIn={flyIn}
          onFlownIn={markIntroSeen}
          options={options}
          slot={demoStep === null ? slot : options.findIndex((o) => o.key === scenario.key)}
          onPick={pick}
          fullscreen={fullscreen}
          demo={
            inScene
              ? {
                  scene: DEMO_SCENES[demoStep],
                  step: demoStep,
                  total: DEMO_SCENES.length,
                  onDone: () => setDemoStep((step) => (step === null ? null : step + 1)),
                }
              : undefined
          }
          demoActive={demoStep !== null}
          onToggleDemo={toggleDemo}
          onExit={() => {
            if (document.fullscreenElement) void document.exitFullscreen()
            onExit(scenario)
          }}
        />
      )}
      {demoStep !== null && demoStep >= demoScenarios.length && (
        <DemoSummary
          scenarios={demoScenarios}
          onReplay={() => setDemoStep(0)}
          onPlanner={() => {
            if (document.fullscreenElement) void document.exitFullscreen()
            onExit(scenario)
          }}
        />
      )}
    </div>
  )
}

export interface DemoControl {
  scene: DemoScene
  step: number
  total: number
  onDone: () => void
}

interface ShowControls {
  /** Set while this scene is part of the automatic show. */
  demo?: DemoControl
  demoActive: boolean
  onToggleDemo: () => void
}

interface FlyInControls {
  sites: Site[]
  /** Open with the flight from the whole Moon (read once, when the scene starts). */
  flyIn: boolean
  onFlownIn: () => void
}

interface StageProps extends ShowControls, FlyInControls {
  scenario: Scenario
  options: Scenario[]
  slot: number
  onPick: (slot: number) => void
  fullscreen: { active: boolean; toggle: () => void }
  onExit: () => void
}

/** One scenario on screen. Keyed by scenario, so switching sites lands again from the top. */
function MissionStage({
  scenario,
  sites,
  flyIn,
  onFlownIn,
  options,
  slot,
  onPick,
  fullscreen,
  onExit,
  demo,
  demoActive,
  onToggleDemo,
}: StageProps) {
  const { lat, lon } = scenario.request
  const analysis = useAnalysis(scenario.request)
  const terrain = useTerrain({ lat, lon })
  const ready = analysis.data && terrain.data

  return (
    <>
      {ready ? (
        <LiveStage
          scenario={scenario}
          sites={sites}
          flyIn={flyIn}
          onFlownIn={onFlownIn}
          analysis={analysis.data}
          terrain={terrain.data}
          options={options}
          slot={slot}
          onPick={onPick}
          fullscreen={fullscreen}
          onExit={onExit}
          demo={demo}
          demoActive={demoActive}
          onToggleDemo={onToggleDemo}
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
            demoActive={demoActive}
            onToggleDemo={onToggleDemo}
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

interface LiveProps extends ShowControls, FlyInControls {
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
  sites,
  flyIn,
  onFlownIn,
  analysis,
  terrain,
  options,
  slot,
  onPick,
  fullscreen,
  onExit,
  demo,
  demoActive,
  onToggleDemo,
}: LiveProps) {
  const { series } = analysis
  const horizon = useHorizon({ lat: scenario.request.lat, lon: scenario.request.lon })
  const [chosenSpeed, setSpeedDays] = useState(1)
  // During the show each scene runs at its own pace.
  const speedDays = demo ? demo.scene.speedDays : chosenSpeed
  const samplesPerDay = 1440 / scenario.request.step_minutes
  const playback = usePlayback(series.times.length, speedDays * samplesPerDay)
  const [landed, setLanded] = useState(false)
  const [playId, setPlayId] = useState(0)

  // The sunlight map on the terrain (W6): requested with the landing, so it is ready when the
  // lunar day starts. Terrain sites only: on a bare sphere every spot is the same.
  const [mapLayer, setMapLayer] = useState<HeatLayer | 'off'>('sun')
  const mapRequest = useMemo(
    () => ({
      ...scenario.request,
      half_extent_km: SUNLIGHT_MAP_HALF_EXTENT_KM,
      step_km: SUNLIGHT_MAP_STEP_KM,
      include_timelines: true,
    }),
    [scenario.request],
  )
  const sunlightMap = useNearby(mapRequest, analysis.horizon_kind === 'terrain')
  const mapCounts = useMemo(() => {
    const t = sunlightMap.data?.timelines
    // The map's samples must be the ones being played, or "so far" would mean another time.
    if (!t || t.samples !== series.times.length) return null
    return {
      sun: runningCounts(t.sun, t.samples),
      earth: runningCounts(t.earth, t.samples),
      present: t.sun.map((bits) => bits !== null),
      samples: t.samples,
    }
  }, [sunlightMap.data, series.times.length])

  // flying: the globe is on screen and the landing waits; fading: the landing has started
  // under the fading globe; done: the globe is gone.
  const [intro, setIntro] = useState<'flying' | 'fading' | 'done'>(flyIn ? 'flying' : 'done')
  function arrive() {
    if (intro !== 'flying') return
    setIntro('fading')
    onFlownIn()
  }
  const { lat, lon } = scenario.request
  const globeSun = useMemo(
    () => azElToGlobe(lat, lon, series.sun.azimuth[0], series.sun.elevation[0]),
    [lat, lon, series],
  )
  const globeEarth = useMemo(
    () => azElToGlobe(lat, lon, series.earth.azimuth[0], series.earth.elevation[0]),
    [lat, lon, series],
  )

  // The show: landing → the skyline traced ray by ray → the lunar day runs by itself.
  // The phase is derived; only the events (touchdown, sweep finished) change state.
  const [traced, setTraced] = useState(false)
  const [panelHidden, setPanelHidden] = useState(false)
  const canTrace = Boolean(horizon.data?.hits)
  const phase = !landed ? 'landing' : canTrace && !traced ? 'tracing' : 'running'

  function startDay() {
    if (!playback.playing) playback.toggle()
  }

  function onLanded() {
    setLanded(true)
    // A smooth sphere (no terrain data) has no skyline to trace: go straight to the day.
    if (!horizon.isPending && !canTrace) startDay()
  }

  function onTraced() {
    setTraced(true)
    startDay()
  }

  function replayLanding() {
    if (playback.playing) playback.toggle()
    setTraced(false)
    setPanelHidden(false)
    setLanded(false)
    setPlayId((n) => n + 1)
  }

  useMissionKeys({
    togglePlay: playback.toggle,
    step: (n, big) => playback.seek(playback.index + n * (big ? samplesPerDay : 1)),
    pickSite: onPick,
    toggleFullscreen: fullscreen.toggle,
    toggleDemo: onToggleDemo,
    exit: onExit,
  })

  const i = playback.index
  const sun = {
    az: series.sun.azimuth[i],
    el: series.sun.elevation[i],
    visible: series.sun.visible_fraction[i] > 0,
    skyline: series.sun.skyline[i],
    diskFraction: series.sun.visible_fraction[i],
  }
  const earth = {
    az: series.earth.azimuth[i],
    el: series.earth.elevation[i],
    visible: series.earth.visible[i],
    skyline: series.earth.skyline[i],
  }
  const sights = sightsFor(sun, earth, horizon.data)

  // The verdict is earned: it appears once the whole period has been played (or scrubbed to).
  const last = series.times.length - 1
  const revealed = playback.furthest >= last
  const reachedMs = Date.parse(series.times[playback.furthest])
  const live = metricsUntil(analysis, reachedMs)
  const progress = last > 0 ? playback.furthest / last : 1

  // Samples approximate the growing map; final colours use the exact duration totals.
  const heat = useMemo(() => {
    if (!mapCounts || !sunlightMap.data || mapLayer === 'off' || phase !== 'running') return null
    const values = sharesUntil(
      mapCounts[mapLayer],
      mapCounts.present.length,
      mapCounts.samples,
      playback.furthest,
      mapCounts.present,
      sunlightMap.data.spots.map((spot) =>
        spot ? (mapLayer === 'sun' ? spot.sunlit_pct : spot.earth_visible_pct) / 100 : null,
      ),
    )
    return { grid: sunlightMap.data, values, layer: mapLayer }
  }, [mapCounts, sunlightMap.data, mapLayer, phase, playback.furthest])

  // In the show, move on a few seconds after the verdict is out.
  const onSceneDone = useRef(demo?.onDone)
  useEffect(() => {
    onSceneDone.current = demo?.onDone
  })
  const inShow = demo !== undefined
  useEffect(() => {
    if (!inShow || !revealed) return
    const timer = setTimeout(() => onSceneDone.current?.(), SCENE_HOLD_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [inShow, revealed])

  const caption = demo?.scene.caption({ phase, progress, revealed, analysis })

  return (
    <>
      <div className="mc-canvas">
        <SiteCanvas
          terrain={terrain}
          heat={heat}
          sun={sun}
          earth={earth}
          playId={playId}
          hold={intro === 'flying'}
          landed={landed}
          onLanded={onLanded}
          overview={FULLSCREEN_OVERVIEW}
          horizon={horizon.data}
          fan={{ runId: phase === 'landing' ? 0 : playId + 1, onDone: onTraced }}
        />
      </div>

      {intro !== 'done' && (
        <Suspense fallback={<div className="mc-intro" />}>
          <GlobeIntro
            sites={sites}
            site={{ lat, lon, name: scenario.name, siteId: scenario.siteId }}
            sun={globeSun}
            earth={globeEarth}
            time={series.times[0]}
            leaving={intro === 'fading'}
            onArrive={arrive}
            onGone={() => setIntro('done')}
          />
        </Suspense>
      )}

      <div className="mc-hud" data-intro={intro === 'flying' || undefined}>
        <HudTop
          scenario={scenario}
          options={options}
          slot={slot}
          onPick={onPick}
          time={series.times[i]}
          fullscreen={fullscreen}
          onExit={onExit}
          demoActive={demoActive}
          onToggleDemo={onToggleDemo}
        />
        {phase === 'landing' && intro !== 'flying' && <DescentHud key={playId} />}
        {revealed && <VerdictReveal key={scenario.key} analysis={analysis} />}
        {demo && caption && (
          <DemoCaption key={caption} text={caption} step={demo.step} total={demo.total} />
        )}
        {phase !== 'landing' && canTrace && !panelHidden && horizon.data && (
          <TracingPanel key={playId} horizon={horizon.data} onHidden={() => setPanelHidden(true)} />
        )}
        <div className="mc-side mc-left">
          <SiteCard
            scenario={scenario}
            analysis={analysis}
            terrain={terrain}
            revealed={revealed}
            progress={progress}
          />
        </div>
        <div className="mc-side mc-right">
          <NowCard analysis={analysis} index={i} sights={sights} />
          <TotalsCard analysis={analysis} live={revealed ? null : live} />
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
            {analysis.horizon_kind === 'terrain' && (
              <SunlightMapSwitch
                layer={mapLayer}
                complete={playback.furthest === last}
                onChange={setMapLayer}
                status={sunlightMap.isError ? 'error' : mapCounts ? 'ready' : 'loading'}
              />
            )}
            <button
              type="button"
              className="secondary mc-replay"
              disabled={!landed}
              onClick={replayLanding}
            >
              ↺ Landing
            </button>
          </div>
          <HudTimeline
            analysis={analysis}
            index={i}
            onSeek={playback.seek}
            revealUntilMs={revealed ? undefined : reachedMs}
          />
          <p className="mc-keys" aria-hidden="true">
            <kbd>Space</kbd> play · <kbd>←</kbd>
            <kbd>→</kbd> time (<kbd>Shift</kbd> a day) · <kbd>1</kbd>–<kbd>{options.length}</kbd>{' '}
            sites · <kbd>D</kbd> demo · <kbd>F</kbd> fullscreen · <kbd>Esc</kbd> planner
          </p>
        </div>
      </div>
    </>
  )
}

const MAP_LAYERS: { key: HeatLayer | 'off'; label: string }[] = [
  { key: 'sun', label: 'Sunlight' },
  { key: 'earth', label: 'Earth' },
  { key: 'off', label: 'Off' },
]

/** Which share of time the terrain is tinted by, with the scale it is read on. */
function SunlightMapSwitch({
  complete,
  layer,
  onChange,
  status,
}: {
  complete: boolean
  layer: HeatLayer | 'off'
  onChange: (layer: HeatLayer | 'off') => void
  status: 'loading' | 'ready' | 'error'
}) {
  return (
    <div className="mc-map" data-layer={layer}>
      <span className="mc-map-label">
        {status === 'loading'
          ? 'Map…'
          : status === 'error'
            ? 'Map unavailable'
            : complete
              ? 'Map'
              : 'Map ≈'}
      </span>
      <div className="segmented" role="group" aria-label="Map on the terrain">
        {MAP_LAYERS.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={layer === m.key}
            disabled={status !== 'ready'}
            onClick={() => onChange(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {status === 'ready' && layer !== 'off' && (
        <span
          className="mc-map-scale"
          title={
            complete
              ? 'Exact duration share for the full period'
              : 'Approximate share of visible samples so far; final values use exact durations'
          }
        >
          0% <span className="mc-map-ramp" aria-hidden="true" /> 100%
        </span>
      )}
    </div>
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
  demoActive,
  onToggleDemo,
}: {
  scenario: Scenario
  options: Scenario[]
  slot: number
  onPick: (slot: number) => void
  time: string | null
  fullscreen: { active: boolean; toggle: () => void }
  onExit: () => void
  demoActive: boolean
  onToggleDemo: () => void
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
        <button
          type="button"
          className="secondary mc-demo-button"
          aria-pressed={demoActive}
          onClick={onToggleDemo}
          title="Automatic show of three polar sites (key D)"
        >
          {demoActive ? '■ Stop demo' : '▶ Demo'}
        </button>
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
  revealed,
  progress,
}: {
  scenario: Scenario
  analysis: AnalyzeResponse
  terrain: TerrainResponse
  revealed: boolean
  /** 0…1 of the period played so far. */
  progress: number
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

      {revealed ? (
        <div className="mc-verdict mc-verdict-revealed" data-verdict={verdict.verdict}>
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
      ) : (
        <div className="mc-verdict-pending">
          <span className="mc-muted">Verdict for a {caption} after the whole period</span>
          <div
            className="mc-progress"
            role="progressbar"
            aria-label="Period played"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

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

function sightsFor(
  sun: { az: number; el: number; visible: boolean; skyline: number; diskFraction: number },
  earth: { az: number; el: number; visible: boolean; skyline: number },
  horizon: HorizonResponse | undefined,
): { sun: Sight; earth: Sight } {
  return {
    sun: sightOf(sun.az, sun.el, sun.visible, sun.skyline, horizon, sun.diskFraction),
    earth: sightOf(earth.az, earth.el, earth.visible, earth.skyline, horizon),
  }
}

function NowCard({
  analysis,
  index,
  sights,
}: {
  analysis: AnalyzeResponse
  index: number
  sights: { sun: Sight; earth: Sight }
}) {
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
      sight: describeSight(sights.sun),
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
      sight: describeSight(sights.earth),
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
      sight: null,
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
            {r.sight && <span className="mc-now-sight">{r.sight}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function TotalsCard({ analysis, live }: { analysis: AnalyzeResponse; live: LiveMetrics | null }) {
  const m = analysis.metrics
  const values = live
    ? {
        sunlit: live.sunlitPct,
        earth: live.earthPct,
        both: live.bothPct,
        dark: live.longestDarkHours,
      }
    : {
        sunlit: m.sunlit_pct,
        earth: m.earth_visible_pct,
        both: m.both_pct,
        dark: m.longest_dark_hours,
      }
  const items = [
    { label: 'Sunlight', value: `${values.sunlit.toFixed(0)}%` },
    { label: 'Earth in view', value: `${values.earth.toFixed(0)}%` },
    { label: 'Sun + Earth', value: `${values.both.toFixed(0)}%` },
    { label: 'Longest night', value: formatDuration(values.dark) },
  ]
  const totalHours =
    (Date.parse(analysis.series.times[analysis.series.times.length - 1]) -
      Date.parse(analysis.series.times[0])) /
    3_600_000

  return (
    <section className="mc-panel" aria-label={live ? 'So far' : 'Whole period'} data-live={!!live}>
      <h3 className="mc-panel-title">
        {live
          ? `So far · ${live.elapsedHours < 1 ? '0 h' : formatDuration(live.elapsedHours)} of ${formatDuration(totalHours)}`
          : 'Whole period'}
      </h3>
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

/** How long the big verdict stays in the middle of the screen. */
const REVEAL_MS = 4500

/** The moment the period ends: the verdict, large, then it settles into the side panel. */
function VerdictReveal({ analysis }: { analysis: AnalyzeResponse }) {
  const { mission } = useMission()
  const verdict = missionVerdict(analysis.metrics, mission)
  const caption = MISSIONS.find((m) => m.key === mission)!.caption
  const [shown, setShown] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShown(false), REVEAL_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!shown) return null
  return (
    <div className="mc-reveal mc-panel" role="status" data-verdict={verdict.verdict}>
      <span className="mc-reveal-kicker">Verdict for a {caption}</span>
      <strong className="mc-reveal-label">{VERDICT_LABEL[verdict.verdict]}</strong>
      <span className="mc-reveal-reason">{verdict.reasons[0]}</span>
    </div>
  )
}
