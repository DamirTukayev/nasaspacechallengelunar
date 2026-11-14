import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useHealth, usePrefetchAnalyses, useSites } from './api/queries'
import { AppFooter } from './components/AppFooter'
import { AppHeader, BackendBanner } from './components/AppHeader'
import { Spinner } from './components/Spinner'
import {
  type AppMode,
  initialMode,
  readStoredMode,
  storeMode,
} from './features/mission-control/mode'
import { ComparisonView } from './features/compare/ComparisonView'
import { useRevealOnChange } from './lib/useRevealOnChange'
import { ComparisonList, MAX_COMPARED } from './features/scenario/ComparisonList'
import { ScenarioPanel } from './features/scenario/ScenarioPanel'
import { ScenarioResult } from './features/scenario/ScenarioResult'
import { ShareButton } from './features/share/ShareButton'
import { type View, searchToState, stateToSearch } from './features/share/shareUrl'
import {
  CUSTOM_SITE,
  type Scenario,
  draftFromScenario,
  initialDraft,
  validateDraft,
} from './features/scenario/scenario'
import { Welcome } from './features/welcome/Welcome'
import {
  type QuickStart,
  allQuickStartScenarios,
  quickStartScenarios,
} from './features/welcome/quickStarts'

// The fullscreen view pulls in three.js: load it only when it is shown.
const MissionControl = lazy(() => import('./features/mission-control/MissionControl'))

export default function App() {
  const sites = useSites()
  const health = useHealth()
  // Quick starts are what most visitors click first: load them as soon as the backend answers.
  const quickStartPrefetch = useMemo(
    () => (sites.data && health.isSuccess ? allQuickStartScenarios(sites.data) : []),
    [sites.data, health.isSuccess],
  )
  usePrefetchAnalyses(quickStartPrefetch)
  const [draft, setDraft] = useState(initialDraft)
  const [active, setActive] = useState<Scenario | null>(null)
  const [compared, setCompared] = useState<Scenario[]>([])
  const [view, setView] = useState<View>('details')
  const [mode, setMode] = useState<AppMode>(() =>
    initialMode(window.location.search, readStoredMode()),
  )

  function openMissionControl() {
    setMode('show')
    storeMode('show')
  }

  /** Back to the planner, continuing with the scenario that was on screen. */
  function exitMissionControl(s: Scenario) {
    setMode('planner')
    storeMode('planner')
    setDraft(draftFromScenario(s))
    setActive(s)
    setView('details')
  }

  // A shared link reopens its scenarios once the catalog is known (site ids need it).
  // Until then the URL is left alone, so a link survives a backend that is still waking up.
  const [restored, setRestored] = useState(false)
  if (!restored && sites.data) {
    setRestored(true)
    const shared = searchToState(window.location.search, sites.data)
    const first = shared.active ?? shared.compared[0]
    if (first) {
      setDraft(draftFromScenario(first))
      setActive(first)
      setCompared(shared.compared)
      setView(shared.view)
    }
  }

  // Keep the URL in step with what is on screen, without adding history entries.
  useEffect(() => {
    if (!restored) return
    const { pathname, search, hash } = window.location
    const state = stateToSearch({ active, compared, view })
    // Mark Mission Control in the URL too, so a reload or a copied link reopens it.
    const next = mode === 'show' ? (state ? `${state}&show=1` : '?show=1') : state
    if (next !== search)
      window.history.replaceState(window.history.state, '', pathname + next + hash)
  }, [restored, active, compared, view, mode])

  const { errors, scenario } = useMemo(() => validateDraft(draft), [draft])

  const compareBlockedReason =
    scenario === null
      ? 'Fix the form first'
      : compared.some((s) => s.key === scenario.key)
        ? 'Already in the comparison'
        : compared.length >= MAX_COMPARED
          ? `Up to ${MAX_COMPARED} scenarios`
          : null

  function analyze() {
    setActive(scenario)
    setView('details')
  }

  function addToComparison() {
    if (!scenario || compareBlockedReason) return
    setCompared((list) => [...list, scenario])
    setActive(scenario)
    // From the second scenario on, the point is to see them together.
    setView(compared.length + 1 >= 2 ? 'compare' : 'details')
  }

  function openCompared(s: Scenario) {
    setDraft(draftFromScenario(s))
    setActive(s)
    setView('details')
  }

  /** A spot picked on the nearby map becomes a custom-coordinates scenario, same dates. */
  function openSpot(lat: number, lon: number) {
    if (!active) return
    const next = {
      ...draftFromScenario(active),
      siteId: CUSTOM_SITE,
      name: '',
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
    }
    setDraft(next)
    const { scenario: s } = validateDraft(next)
    if (s) {
      setActive(s)
      setView('details')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function removeCompared(key: string) {
    setCompared((list) => list.filter((s) => s.key !== key))
  }

  function quickStart(id: QuickStart) {
    if (!sites.data) return
    const { drafts, scenarios } = quickStartScenarios(id, sites.data)
    if (scenarios.length === 0) return

    setDraft(drafts[0])
    setActive(scenarios[0])
    if (scenarios.length > 1) {
      setCompared(scenarios.slice(0, MAX_COMPARED))
      setView('compare')
    } else {
      setView('details')
    }
  }

  // On a phone the result is below the form: bring it into view when it changes.
  const mainColumn = useRevealOnChange<HTMLDivElement>(`${active?.key ?? ''}|${view}`)
  // Nothing analysed yet: on a phone, show the introduction and quick starts before the form.
  const welcome = view === 'details' && active === null

  return (
    <div className="app">
      {mode === 'show' &&
        (sites.data ? (
          <Suspense
            fallback={
              <div className="mc mc-boot">
                <Spinner label="Preparing Mission Control…" />
              </div>
            }
          >
            <MissionControl sites={sites.data} current={active} onExit={exitMissionControl} />
          </Suspense>
        ) : (
          <div className="mc mc-boot">
            <p className="mc-loading-title">Lunar Site Planner</p>
            <Spinner label="Connecting to the server…" />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setMode('planner')
                storeMode('planner')
              }}
            >
              Open planner
            </button>
          </div>
        ))}
      <AppHeader onMissionControl={openMissionControl} />
      <BackendBanner />
      <main className="layout" data-welcome={welcome || undefined}>
        <aside className="sidebar">
          <ScenarioPanel
            draft={draft}
            errors={errors}
            canSubmit={scenario !== null}
            compareBlockedReason={compareBlockedReason}
            onChange={setDraft}
            onSubmit={analyze}
            onCompare={addToComparison}
          />
          <ComparisonList
            scenarios={compared}
            activeKey={active?.key ?? null}
            onSelect={openCompared}
            onRemove={removeCompared}
          />
        </aside>
        <div className="main-column" ref={mainColumn}>
          <div className="tabs" role="tablist" aria-label="Result view">
            <button
              type="button"
              role="tab"
              id="tab-details"
              aria-selected={view === 'details'}
              aria-controls="panel-details"
              onClick={() => setView('details')}
            >
              Details
            </button>
            <button
              type="button"
              role="tab"
              id="tab-compare"
              aria-selected={view === 'compare'}
              aria-controls="panel-compare"
              onClick={() => setView('compare')}
            >
              Compare{compared.length > 0 ? ` (${compared.length})` : ''}
            </button>
            {(active || compared.length > 0) && <ShareButton />}
          </div>
          <div
            role="tabpanel"
            id={view === 'details' ? 'panel-details' : 'panel-compare'}
            aria-labelledby={view === 'details' ? 'tab-details' : 'tab-compare'}
          >
            {view === 'compare' ? (
              <ComparisonView
                scenarios={compared}
                onOpen={openCompared}
                onRemove={removeCompared}
              />
            ) : active ? (
              <ScenarioResult scenario={active} onOpenSpot={openSpot} />
            ) : (
              <Welcome onQuickStart={quickStart} disabled={!sites.data} />
            )}
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  )
}
