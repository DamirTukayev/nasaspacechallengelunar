import { lazy, Suspense, useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Link } from '../../components/ui/Link'
import { Spinner } from '../../components/Spinner'
import type { Scenario } from '../scenario/scenario'
import type { AnimationLoad } from './MissionView'
import {
  type DataSource,
  type LandingRequest,
  type LandingSearch,
  hasLandingSite,
  loadLandingSearch,
  loadSavedLandingSearch,
  matchesLandingRequest,
  formatLat,
  formatLon,
} from './landing'
import { candidateHref, landingPresentation, type LandingPresentation } from './presentation'
import { LandingMap } from './LandingMap'
import type { LandingMapLayer } from './scoreLayer'
import './landing-search.css'

const MissionAnimation = lazy(() => import('./MissionView'))
type Load =
  | { state: 'loading' }
  | { state: 'ready'; data: LandingSearch; source: DataSource }
  | { state: 'error'; message: string }

function requestFromScenario(scenario: Scenario | null): LandingRequest | undefined {
  return scenario
    ? {
        start: scenario.request.start,
        end: scenario.request.end,
        stepMinutes: Math.max(60, scenario.request.step_minutes),
        radiusKm: 80,
        spacingKm: 5,
      }
    : undefined
}

function SearchSettings({
  initial,
  busy,
  onSearch,
}: {
  initial: LandingRequest
  busy: boolean
  onSearch: (request: LandingRequest) => void
}) {
  const [draft, setDraft] = useState(initial)
  const valid = Date.parse(draft.end) - Date.parse(draft.start) >= draft.stepMinutes * 60000
  return (
    <form
      className="landing-settings"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onSearch(draft)
      }}
    >
      <label>
        Start (UTC)
        <input
          type="datetime-local"
          required
          value={draft.start.slice(0, 16)}
          onChange={(event) => setDraft({ ...draft, start: `${event.target.value}:00Z` })}
        />
      </label>
      <label>
        End (UTC)
        <input
          type="datetime-local"
          required
          value={draft.end.slice(0, 16)}
          onChange={(event) => setDraft({ ...draft, end: `${event.target.value}:00Z` })}
        />
      </label>
      <label>
        Radius
        <select
          aria-label="Search radius"
          value={draft.radiusKm}
          onChange={(event) => setDraft({ ...draft, radiusKm: Number(event.target.value) })}
        >
          {[40, 80, 120].map((value) => (
            <option key={value} value={value}>
              {value} km
            </option>
          ))}
        </select>
      </label>
      <label>
        Grid
        <select
          aria-label="Candidate grid spacing"
          value={draft.spacingKm}
          onChange={(event) => setDraft({ ...draft, spacingKm: Number(event.target.value) })}
        >
          {[5, 10, 20].map((value) => (
            <option key={value} value={value}>
              {value} km
            </option>
          ))}
        </select>
      </label>
      <label>
        Time step
        <select
          aria-label="Search time step"
          value={draft.stepMinutes}
          onChange={(event) => setDraft({ ...draft, stepMinutes: Number(event.target.value) })}
        >
          {[60, 180, 360].map((value) => (
            <option key={value} value={value}>
              {value / 60} hours
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="primary" disabled={!valid || busy}>
        {busy ? 'Searching…' : 'Search'}
      </Button>
      {!valid && (
        <p className="field-error" role="status">
          Choose a period at least one time step long.
        </p>
      )}
    </form>
  )
}

function CandidateDetails({
  data,
  index,
  context,
}: {
  data: LandingSearch
  index: number
  context: string
}) {
  const points = data.points
  const analysis = candidateHref(data, index, 'planner', context)
  const mission = candidateHref(data, index, 'show', context)
  return (
    <section
      className="landing-candidate-details"
      aria-live="polite"
      aria-label="Selected candidate"
    >
      <h2>
        {formatLat(points.lat[index])} {formatLon(points.lon[index])}
      </h2>
      <dl>
        <div>
          <dt>Sunlit</dt>
          <dd>{points.sunlit_pct[index].toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Earth visible</dt>
          <dd>{points.earth_pct[index].toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Slope</dt>
          <dd>{points.slope_deg[index].toFixed(1)}°</dd>
        </div>
        <div>
          <dt>Longest night</dt>
          <dd>{Math.round(points.longest_dark_h[index])} h</dd>
        </div>
        <div>
          <dt>Hydrogen</dt>
          <dd>{Math.round(points.hydrogen_ppm[index])} ppm</dd>
        </div>
        <div>
          <dt>Elevation</dt>
          <dd>{Math.round(points.alt_m[index])} m</dd>
        </div>
      </dl>
      <div className="landing-candidate-actions">
        {mission && (
          <Link variant="primary" href={mission}>
            Open in Mission Control
          </Link>
        )}
        {analysis && (
          <Link variant="outline" href={analysis}>
            Detailed analysis
          </Link>
        )}
      </div>
    </section>
  )
}

export default function LandingSearchWorkspace({
  context,
  scenario,
}: {
  context: string
  scenario: Scenario | null
}) {
  const [presentation, setPresentation] = useState(() =>
    landingPresentation(window.location.search),
  )
  const [request, setRequest] = useState<LandingRequest | undefined>(() =>
    requestFromScenario(scenario),
  )
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [selected, setSelected] = useState<number | null>(null)
  const [mapLayer, setMapLayer] = useState<LandingMapLayer>('relief')
  useEffect(() => {
    const controller = new AbortController()
    const loading = request
      ? loadLandingSearch(request, controller.signal)
      : loadSavedLandingSearch(controller.signal)
    loading
      .then((result) => {
        if (controller.signal.aborted) return
        setLoad({ state: 'ready', ...result })
        setSelected(result.data.best)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoad({ state: 'error', message: String(error) })
      })
    return () => controller.abort()
  }, [request])

  function choosePresentation(next: LandingPresentation) {
    setPresentation(next)
    const url = new URL(window.location.href)
    if (next === 'map') url.searchParams.set('landing-view', 'map')
    else url.searchParams.delete('landing-view')
    window.history.replaceState(window.history.state, '', url.pathname + url.search)
  }
  function search(next: LandingRequest) {
    setLoad({ state: 'loading' })
    setRequest({ ...next })
  }

  const animation: AnimationLoad =
    load.state === 'ready'
      ? hasLandingSite(load.data)
        ? { ...load, data: load.data }
        : { state: 'empty' }
      : load
  const data = load.state === 'ready' ? load.data : null
  const initial =
    request ??
    (data
      ? {
          start: data.period_start,
          end: data.period_end,
          stepMinutes: data.step_minutes,
          radiusKm: data.radius_km,
          spacingKm: data.spacing_km,
        }
      : undefined)
  return (
    <div className="landing-workspace">
      <div className="landing-view-bar">
        <div className="landing-view-switch" role="group" aria-label="Landing search view">
          <Button
            size="compact"
            variant={presentation === 'scene' ? 'primary' : 'outline'}
            aria-pressed={presentation === 'scene'}
            onClick={() => choosePresentation('scene')}
          >
            3D walkthrough
          </Button>
          <Button
            size="compact"
            variant={presentation === 'map' ? 'primary' : 'outline'}
            aria-pressed={presentation === 'map'}
            onClick={() => choosePresentation('map')}
          >
            Map &amp; candidates
          </Button>
        </div>
        {load.state === 'ready' && (
          <span className="landing-result-source">
            {load.source === 'live' ? 'Computed by backend' : 'Saved calculation'} ·{' '}
            {load.data.period_start.slice(0, 10)} - {load.data.period_end.slice(0, 10)}
          </span>
        )}
      </div>
      <details className="landing-search-settings">
        <summary>Search settings{scenario ? ' · period from Planner' : ''}</summary>
        {initial && (
          <SearchSettings
            key={JSON.stringify(initial)}
            initial={initial}
            busy={load.state === 'loading'}
            onSearch={search}
          />
        )}
      </details>
      {load.state === 'ready' &&
        load.source === 'precomputed' &&
        !matchesLandingRequest(load.data, request) && (
          <p className="landing-notice" role="status">
            The requested search is unavailable. Showing the saved calculation for{' '}
            {load.data.period_start.slice(0, 10)} - {load.data.period_end.slice(0, 10)}, radius{' '}
            {load.data.radius_km} km and grid {load.data.spacing_km} km. Candidate links use this
            saved period.
          </p>
        )}
      {presentation === 'scene' ? (
        <Suspense fallback={<Spinner label="Loading lunar scene…" />}>
          <MissionAnimation load={animation} />
        </Suspense>
      ) : load.state === 'loading' ? (
        <div className="landing-map-loading">
          <Spinner label="Loading search results…" />
        </div>
      ) : load.state === 'error' ? (
        <p role="alert" className="field-error">
          {load.message}
        </p>
      ) : (
        <section className="landing-map-layout" aria-label="Landing candidates">
          <LandingMap
            data={load.data}
            selected={selected}
            onSelect={setSelected}
            layer={mapLayer}
            onLayerChange={setMapLayer}
          />
          <aside className="landing-results ui-inverse">
            <div>
              <h2>Landing candidates</h2>
              <p>
                {load.data.points.eligible.filter(Boolean).length} eligible of{' '}
                {load.data.points.lat.length} sites · {load.data.radius_km} km radius
              </p>
            </div>
            <ol className="landing-ranking">
              {load.data.ranking.slice(0, 5).map((index, rank) => (
                <li key={index}>
                  <button
                    type="button"
                    className="landing-candidate"
                    aria-pressed={selected === index}
                    onClick={() => setSelected(index)}
                  >
                    <span className="landing-candidate-rank">{rank + 1}</span>
                    <span>
                      <strong>
                        {formatLat(load.data.points.lat[index])}{' '}
                        {formatLon(load.data.points.lon[index])}
                      </strong>
                      <small>
                        Score {load.data.points.total[index].toFixed(3)} · slope{' '}
                        {load.data.points.slope_deg[index].toFixed(1)}°
                      </small>
                    </span>
                    <span className="landing-candidate-check" aria-hidden="true">
                      {selected === index ? '✓' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {selected !== null && (
              <CandidateDetails data={load.data} index={selected} context={context} />
            )}
            {load.data.best === null && (
              <p role="status">No sites meet the search limits for this period.</p>
            )}
            <p className="landing-model-note">
              Regional screening. Detailed analysis checks the selected site with the finer horizon
              model. The walkthrough lands at the top-ranked site.
            </p>
          </aside>
        </section>
      )}
      {presentation === 'scene' && data && (
        <div className="landing-scene-results">
          <p>Illustrative walkthrough of the top-ranked site. Compare candidates on the map.</p>
          <Button onClick={() => choosePresentation('map')}>Compare candidates</Button>
        </div>
      )}
    </div>
  )
}
