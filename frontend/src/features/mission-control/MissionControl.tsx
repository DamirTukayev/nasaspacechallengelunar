import { compareSpots } from '../nearby/spotComparison'
import { SpotComparisonPanel } from '../nearby/SpotComparisonPanel'
import { terrainHeight } from '../scene3d/terrainMap'
import type { ComparisonView } from '../scene3d/ComparisonMarkers'
import { VerdictReveal } from './VerdictReveal'
import { SkyPanel } from './SkyPanel'
import { runningCounts, sharesUntil } from '../scene3d/heat'
import { useSceneQuality } from '../scene3d/useSceneQuality'
import type { QualityChoice } from '../scene3d/quality'
import { useNearby } from '../../api/nearby'
import { cells, colorFor, describeOffset } from '../nearby/nearby'
import type { TerrainMetric } from '../scene3d/terrainMap'
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
import { useAnalysis, useHorizon, useTerrain } from '../../api/queries'
import type { AnalyzeResponse, HorizonResponse, Site, TerrainResponse } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { formatDuration, formatUtc } from '../../lib/time'
import { formatCountdown, statusAt } from '../metrics/countdown'
import { MISSIONS, missionVerdict } from '../mission/mission'
import { useMission } from '../mission/useMission'
import type { Scenario } from '../scenario/scenario'
import { SiteCanvas } from '../scene3d/SiteScene'
import type { Vec3 } from '../scene3d/math'
import { type Sight, describeSight, sightOf } from '../scene3d/sight'
import { usePlayback } from '../timeline/usePlayback'
import { draftFromSite, initialDraft, validateDraft } from '../scenario/scenario'
import { quickStartScenarios } from '../welcome/quickStarts'
import { HudTimeline } from './HudTimeline'
import { type LiveMetrics, metricsUntil } from './live'
import { TracingPanel } from './TracingPanel'
import { DEMO_SCENES, type DemoScene, SCENE_HOLD_SECONDS } from './demo'
import { DemoCaption, DemoSummary } from './DemoParts'
import { DescentHud } from './DescentHud'
import { prefersReducedMotion, shouldFlyIn } from './flyIn'
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

const GlobeIntro = lazy(() => import('./GlobeIntro'))

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

  const showcase = useMemo(() => {
    const list = quickStartScenarios('polar-trio', sites).scenarios
    const ridge = sites.find((site) => site.id === 'shackleton-ridge')
    const scenario = ridge && validateDraft(draftFromSite(initialDraft(), ridge)).scenario
    return scenario ? [...list, scenario] : list
  }, [sites])
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

  // Remember the flight only while Mission Control is open.
  const [reducedMotion] = useState(prefersReducedMotion)
  const [introSeen, setIntroSeen] = useState(false)
  const flyIn = shouldFlyIn({ reducedMotion, seen: introSeen, demoStep })
  function markIntroSeen() {
    setIntroSeen(true)
  }
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
  const [runId, setRunId] = useState(0)
  const { lat, lon } = scenario.request
  const analysis = useAnalysis(scenario.request)
  const terrain = useTerrain({ lat, lon })
  const ready = analysis.data && terrain.data

  return (
    <>
      {ready ? (
        <LiveStage
          key={runId}
          onRestart={() => setRunId((n) => n + 1)}
          scenario={scenario}
          sites={sites}
          flyIn={runId > 0 ? !prefersReducedMotion() : flyIn}
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
  onRestart: () => void
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
  onRestart,
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
  const quality = useSceneQuality()
  const [mapMetric, setMapMetric] = useState<TerrainMetric | 'off'>('sunlit_pct')
  const [mapSample, setMapSample] = useState(220)
  const [showSky, setShowSky] = useState(true)
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareSelected, setCompareSelected] = useState<'A' | 'B'>('A')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const detailsButtonRef = useRef<HTMLButtonElement>(null)
  const [chosenSpeed, setSpeedDays] = useState(1)
  // During the show each scene runs at its own pace.
  const speedDays = demo ? demo.scene.speedDays : chosenSpeed
  const samplesPerDay = 1440 / scenario.request.step_minutes
  const playback = usePlayback(series.times.length, speedDays * samplesPerDay)
  const [landed, setLanded] = useState(false)
  const [playId, setPlayId] = useState(0)

  // The camera approaches the terrain on the same globe before the descent starts.
  const [intro, setIntro] = useState<'flying' | 'done'>(flyIn ? 'flying' : 'done')
  function arrive() {
    if (intro !== 'flying') return
    setIntro('done')
    onFlownIn()
  }
  const { lat, lon } = scenario.request
  const altitudeRef = useRef<HTMLElement>(null)
  const [wholeGlobe, setWholeGlobe] = useState(false)

  // The show: landing → the skyline traced ray by ray → the lunar day runs by itself.
  // The phase is derived; only the events (touchdown, sweep finished) change state.
  const [traced, setTraced] = useState(false)
  const [skyDrawn, setSkyDrawn] = useState(false)
  const [panelHidden, setPanelHidden] = useState(false)
  const canTrace = Boolean(horizon.data?.hits)
  const phase = !landed
    ? 'landing'
    : horizon.isPending || (canTrace && !traced)
      ? 'tracing'
      : !skyDrawn
        ? 'sky'
        : 'running'
  const mapEnabled = quality.quality !== 'low' && terrain.kind === 'terrain' && mapMetric !== 'off'
  const mapRequest = useMemo(
    () => ({ ...scenario.request, half_extent_km: 20, step_km: 2, include_timelines: true }),
    [scenario.request],
  )
  const nearby = useNearby(mapRequest, mapEnabled || compareOpen)
  const comparison = useMemo(
    () =>
      nearby.data ? compareSpots(nearby.data, scenario.request.start, scenario.request.end) : null,
    [nearby.data, scenario.request.start, scenario.request.end],
  )
  const comparisonView: ComparisonView | undefined =
    compareOpen && comparison
      ? {
          selected: compareSelected,
          onSelect: setCompareSelected,
          positions: [comparison.here, comparison.best].map((c) => [
            c.eastM / 1000,
            terrainHeight(terrain, c.eastM, c.northM) + 0.05,
            -c.northM / 1000,
          ]) as ComparisonView['positions'],
        }
      : undefined
  const mapCounts = useMemo(() => {
    const t = nearby.data?.timelines
    if (!t || t.samples !== series.times.length) return null
    return {
      sun: runningCounts(t.sun, t.samples),
      earth: runningCounts(t.earth, t.samples),
      present: t.sun.map((v) => v !== null),
      samples: t.samples,
    }
  }, [nearby.data, series.times.length])
  const mapValues = useMemo(() => {
    if (!mapCounts || !nearby.data || mapMetric === 'off') return undefined
    return sharesUntil(
      mapCounts[mapMetric === 'sunlit_pct' ? 'sun' : 'earth'],
      nearby.data.spots.length,
      mapCounts.samples,
      playback.furthest,
      mapCounts.present,
      nearby.data.spots.map((s) => (s ? s[mapMetric] / 100 : null)),
    )
  }, [mapCounts, nearby.data, mapMetric, playback.furthest])
  const skyTrack = useMemo(
    () => ({
      sun: {
        azimuth: series.sun.azimuth,
        elevation: series.sun.elevation,
        visible: series.sun.visible_fraction.map((f) => f > 0),
      },
      earth: {
        azimuth: series.earth.azimuth,
        elevation: series.earth.elevation,
        visible: series.earth.visible,
      },
    }),
    [series],
  )

  function startDay() {
    if (!playback.playing) playback.toggle()
  }

  function onLanded() {
    setLanded(true)
  }

  function onTraced() {
    setTraced(true)
  }

  function onSkyDrawn() {
    setSkyDrawn(true)
    startDay()
  }

  function replayLanding() {
    setCompareOpen(false)
    setWholeGlobe(false)
    if (playback.playing) playback.toggle()
    setTraced(false)
    setSkyDrawn(false)
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
          comparison={comparisonView}
          terrain={terrain}
          quality={quality.quality}
          onFrameSample={quality.sample}
          sun={sun}
          earth={earth}
          playId={playId}
          hold={intro === 'flying'}
          globe={{
            site: { lat, lon, name: scenario.name, siteId: scenario.siteId },
            sites,
            flying: intro === 'flying',
            whole: wholeGlobe,
            onArrive: arrive,
            altitudeRef,
          }}
          landed={landed}
          onLanded={onLanded}
          overview={FULLSCREEN_OVERVIEW}
          sky={{
            track: skyTrack,
            runId: phase === 'sky' || phase === 'running' ? playId + 1 : 0,
            onDone: onSkyDrawn,
            visible: showSky && !wholeGlobe && !compareOpen,
          }}
          map={
            !compareOpen && mapEnabled && phase === 'running' && nearby.data
              ? { data: nearby.data, metric: mapMetric, selected: mapSample, values: mapValues }
              : undefined
          }
          horizon={horizon.data}
          fan={{ runId: phase === 'landing' ? 0 : playId + 1, onDone: onTraced }}
        />
      </div>

      {intro === 'flying' && (
        <Suspense fallback={null}>
          <GlobeIntro
            name={scenario.name}
            time={series.times[0]}
            altitudeRef={altitudeRef}
            onArrive={arrive}
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
        {revealed && (
          <VerdictReveal key={scenario.key} analysis={analysis} visible={inspectorOpen} />
        )}
        {phase === 'sky' && inspectorOpen && <SkyPanel analysis={analysis} />}
        {inspectorOpen && phase === 'tracing' && canTrace && !panelHidden && horizon.data && (
          <TracingPanel key={playId} horizon={horizon.data} onHidden={() => setPanelHidden(true)} />
        )}
        {compareOpen &&
          (comparison ? (
            <SpotComparisonPanel
              comparison={comparison}
              selected={compareSelected}
              onSelect={setCompareSelected}
              onClose={() => setCompareOpen(false)}
            />
          ) : (
            <section className="mc-compare-panel" aria-label="Nearby site comparison">
              <button onClick={() => setCompareOpen(false)}>Close comparison</button>
              {nearby.isPending ? (
                <p role="status">Searching nearby terrain…</p>
              ) : nearby.isError ? (
                <p role="alert">
                  Search unavailable.{' '}
                  <button onClick={() => void nearby.refetch()}>Retry search</button>
                </p>
              ) : (
                <p>
                  No sampled point improves total sunlight + Earth contact, or the original point
                  has no terrain data.
                </p>
              )}
            </section>
          ))}
        <aside
          className="mc-drawer"
          id="mission-details"
          aria-label="Mission details"
          hidden={!inspectorOpen}
        >
          <div className="mc-drawer-heading">
            <strong>Mission details</strong>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setInspectorOpen(false)
                detailsButtonRef.current?.focus()
              }}
            >
              Close
            </button>
          </div>
          <div className="mc-side mc-left">
            <details className="mc-inspector">
              <summary>
                {scenario.name}
                <span>Site & mission</span>
              </summary>
              <SiteCard
                scenario={scenario}
                analysis={analysis}
                terrain={terrain}
                revealed={revealed}
                progress={progress}
              />
            </details>
            <details className="mc-panel mc-visuals">
              <summary>Sky paths, map & quality</summary>
              <label>
                Quality
                <select
                  aria-label="Scene quality"
                  value={quality.choice}
                  onChange={(e) => quality.setChoice(e.target.value as QualityChoice)}
                >
                  <option value="auto">Auto ({quality.quality})</option>
                  <option value="high">High</option>
                  <option value="balanced">Balanced</option>
                  <option value="low">Simplified</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showSky}
                  onChange={(e) => setShowSky(e.target.checked)}
                />{' '}
                Sky hemisphere
              </label>
              <label>
                Terrain colour
                <select
                  aria-label="Terrain colour"
                  value={mapMetric}
                  disabled={terrain.kind !== 'terrain' || quality.quality === 'low'}
                  onChange={(e) => setMapMetric(e.target.value as TerrainMetric | 'off')}
                >
                  <option value="off">Relief</option>
                  <option value="sunlit_pct">Sunlight</option>
                  <option value="earth_visible_pct">Earth visibility</option>
                </select>
              </label>
              {terrain.kind !== 'terrain' && <p>No terrain map available here.</p>}
              {mapEnabled && (
                <>
                  <p>
                    2 km grid within ±20 km. Colours between nodes are interpolated. During playback
                    the map estimates the visible sample share so far; the final frame uses exact
                    full-period durations.
                  </p>
                  {nearby.isPending && <p role="status">Computing 441 terrain horizons…</p>}
                  {nearby.isError && (
                    <p role="alert">
                      Map unavailable: {nearby.error.message}{' '}
                      <button type="button" onClick={() => void nearby.refetch()}>
                        Retry map
                      </button>
                    </p>
                  )}
                  {nearby.data && (
                    <>
                      <div className="mc-map-legend">
                        <span>0%</span>
                        <i
                          style={{
                            background: `linear-gradient(90deg, ${[0, 25, 50, 75, 100].map(colorFor).join(', ')})`,
                          }}
                        />
                        <span>100%</span>
                      </div>
                      <label>
                        Grid node
                        <select
                          aria-label="Grid node"
                          value={mapSample}
                          onChange={(e) => setMapSample(Number(e.target.value))}
                        >
                          {cells(nearby.data).map((cell) => (
                            <option key={cell.index} value={cell.index} disabled={!cell.spot}>
                              {describeOffset(cell.eastM, cell.northM)}:{' '}
                              {cell.spot
                                ? `${(mapValues ? mapValues[cell.index] * 100 : cell.spot[mapMetric]).toFixed(1)}%`
                                : 'no DEM'}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>
                        Same calculation as “Better spots nearby”; the grid here spans the full
                        terrain patch.
                      </p>
                    </>
                  )}
                </>
              )}
            </details>
          </div>
          <div className="mc-side mc-right">
            <details className="mc-inspector mc-live-status">
              <summary>
                {sun.visible ? '☀ Sun up' : '☀ Sun down'}
                <span>
                  {earth.visible ? '◉ Earth in view' : '◉ No Earth link'} · Live conditions
                </span>
              </summary>
              <NowCard analysis={analysis} index={i} sights={sights} />
            </details>
            <details className="mc-inspector">
              <summary>
                Mission metrics
                <span>{revealed ? 'Whole period' : `${Math.round(progress * 100)}% played`}</span>
              </summary>
              <TotalsCard analysis={analysis} live={revealed ? null : live} />
            </details>
          </div>
          <details className="mc-playback-info">
            <summary>Data & shortcuts</summary>
            {phase === 'running' && showSky && (
              <p className="mc-sky-caption">
                JPL Horizons: {series.times.length.toLocaleString('en-US')} positions per body ·
                full-period paths · Sun yellow, Earth blue · faint paths where terrain blocks
                visibility
              </p>
            )}
            <p className="mc-quality" aria-live="off">
              {quality.quality === 'low'
                ? 'Simplified · shadows and terrain map off'
                : `${quality.quality === 'high' ? 'High' : 'Balanced'} quality`}
              {quality.fps !== null ? ` · ${quality.fps} fps` : ''}
            </p>
            <p className="mc-shortcuts">
              Space: play · ← →: time · 1–4: sites · D: demo · F: fullscreen · Esc: planner
            </p>
          </details>
        </aside>
        <div className="mc-bottom mc-panel">
          {demo && caption && (
            <DemoCaption key={caption} text={caption} step={demo.step} total={demo.total} />
          )}

          <div className="mc-controls">
            <button
              type="button"
              className="mc-summary"
              ref={detailsButtonRef}
              aria-expanded={inspectorOpen}
              aria-controls="mission-details"
              onClick={() => setInspectorOpen((v) => !v)}
            >
              <span className="mc-summary-scope">
                {compareOpen ? 'A · ' : ''}
                {revealed ? 'Whole period' : 'So far'}
              </span>
              <span className="mc-summary-sun">
                Sunlight {Math.round(revealed ? analysis.metrics.sunlit_pct : live.sunlitPct)}%
              </span>
              <span className="mc-summary-earth">
                Earth link{' '}
                {Math.round(revealed ? analysis.metrics.earth_visible_pct : live.earthPct)}%
              </span>
              <span>{inspectorOpen ? 'Hide details' : 'Details & settings'}</span>
            </button>
            <button
              type="button"
              className="play-button"
              aria-pressed={playback.playing}
              aria-label={playback.playing ? 'Pause' : 'Play'}
              onClick={playback.toggle}
            >
              {playback.playing ? '❚❚' : '▶'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={phase !== 'running' || wholeGlobe || terrain.kind !== 'terrain'}
              aria-pressed={compareOpen}
              onClick={() => {
                setCompareOpen((v) => !v)
                setWholeGlobe(false)
                setInspectorOpen(false)
                if (playback.playing) playback.toggle()
              }}
            >
              Compare nearby
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
              onClick={replayLanding}
            >
              ↺ Landing
            </button>
            <button
              type="button"
              className="secondary"
              disabled={phase !== 'running' || compareOpen}
              aria-pressed={wholeGlobe}
              onClick={() => setWholeGlobe((v) => !v)}
            >
              {wholeGlobe ? 'Landing site' : 'Whole Moon'}
            </button>
            <button type="button" className="secondary" onClick={onRestart}>
              Replay from Moon
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
          ? `Skyline from ${terrain.dem?.includes('SHACKRDGE02') ? 'LOLA + NAC terrain' : 'LRO LOLA terrain'}, 200 km`
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
