import { useMemo, useState } from 'react'
import { API_URL, USE_MOCKS } from './api/client'
import { useHealth } from './api/queries'
import { ComparisonView } from './features/compare/ComparisonView'
import { ComparisonList, MAX_COMPARED } from './features/scenario/ComparisonList'
import { ScenarioPanel } from './features/scenario/ScenarioPanel'
import { ScenarioResult } from './features/scenario/ScenarioResult'
import {
  type Scenario,
  draftFromScenario,
  initialDraft,
  validateDraft,
} from './features/scenario/scenario'

function ApiStatus() {
  const { data, isPending, isError } = useHealth()

  const state = isPending ? 'pending' : isError ? 'error' : 'ok'
  const label = isPending
    ? 'connecting…'
    : isError
      ? 'unavailable'
      : USE_MOCKS
        ? 'ok'
        : `ok · v${data.version}`

  return (
    <div className="status" data-state={state}>
      <span className="status-dot" />
      <span>
        API {USE_MOCKS ? '(mocks)' : API_URL}: {label}
      </span>
    </div>
  )
}

export default function App() {
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

  return (
    <div className="app">
      <header className="header">
        <h1>Lunar Site Planner</h1>
        <ApiStatus />
      </header>
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
            {view === 'details' ? (
              <ScenarioResult scenario={active} />
            ) : (
              <ComparisonView
                scenarios={compared}
                onOpen={openCompared}
                onRemove={removeCompared}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
