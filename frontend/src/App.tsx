import { useMemo, useState } from 'react'
import { API_URL, USE_MOCKS } from './api/client'
import { useHealth } from './api/queries'
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

  const { errors, scenario } = useMemo(() => validateDraft(draft), [draft])

  const compareBlockedReason =
    scenario === null
      ? 'Fix the form first'
      : compared.some((s) => s.key === scenario.key)
        ? 'Already in the comparison'
        : compared.length >= MAX_COMPARED
          ? `Up to ${MAX_COMPARED} scenarios`
          : null

  function addToComparison() {
    if (!scenario || compareBlockedReason) return
    setCompared((list) => [...list, scenario])
    setActive(scenario)
  }

  function openCompared(s: Scenario) {
    setDraft(draftFromScenario(s))
    setActive(s)
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
            onSubmit={() => setActive(scenario)}
            onCompare={addToComparison}
          />
          <ComparisonList
            scenarios={compared}
            activeKey={active?.key ?? null}
            onSelect={openCompared}
            onRemove={(key) => setCompared((list) => list.filter((s) => s.key !== key))}
          />
        </aside>
        <ScenarioResult scenario={active} />
      </main>
    </div>
  )
}
