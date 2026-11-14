import { useMemo, useState } from 'react'
import { useSites } from './api/queries'
import { AppFooter } from './components/AppFooter'
import { AppHeader, BackendBanner } from './components/AppHeader'
import { ComparisonView } from './features/compare/ComparisonView'
import { ComparisonList, MAX_COMPARED } from './features/scenario/ComparisonList'
import { ScenarioPanel } from './features/scenario/ScenarioPanel'
import { ScenarioResult } from './features/scenario/ScenarioResult'
import {
  type Scenario,
  draftFromScenario,
  draftFromSite,
  initialDraft,
  validateDraft,
} from './features/scenario/scenario'
import { type QuickStart, Welcome } from './features/welcome/Welcome'

const QUICK_START_SITES: Record<QuickStart, string[]> = {
  'south-pole': ['south-pole'],
  'polar-trio': ['south-pole', 'mons-malapert', 'im-1'],
  'apollo-11': ['apollo-11'],
}

export default function App() {
  const sites = useSites()
  const [draft, setDraft] = useState(initialDraft)
  const [active, setActive] = useState<Scenario | null>(null)
  const [compared, setCompared] = useState<Scenario[]>([])
  const [view, setView] = useState<'details' | 'compare'>('details')

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

  function removeCompared(key: string) {
    setCompared((list) => list.filter((s) => s.key !== key))
  }

  function quickStart(id: QuickStart) {
    const base = initialDraft()
    const picked = QUICK_START_SITES[id]
      .map((siteId) => sites.data?.find((s) => s.id === siteId))
      .filter((s) => s !== undefined)
      .map((site) => draftFromSite(base, site))
    const scenarios = picked
      .map((d) => validateDraft(d).scenario)
      .filter((s): s is Scenario => s !== null)
    if (scenarios.length === 0) return

    setDraft(picked[0])
    setActive(scenarios[0])
    if (scenarios.length > 1) {
      setCompared(scenarios.slice(0, MAX_COMPARED))
      setView('compare')
    } else {
      setView('details')
    }
  }

  return (
    <div className="app">
      <AppHeader />
      <BackendBanner />
      <main className="layout">
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
        <div className="main-column">
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
              <ScenarioResult scenario={active} />
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
