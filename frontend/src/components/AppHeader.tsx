import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { API_URL, IS_LOCAL_API, USE_MOCKS } from '../api/client'
import { useHealth } from '../api/queries'
import { SiteHeader } from './SiteHeader'

function ApiStatus() {
  const { data, isPending, isError } = useHealth()

  const state = isPending ? 'pending' : isError ? 'error' : 'ok'
  const label = isPending
    ? IS_LOCAL_API
      ? 'Connecting…'
      : 'Connecting…'
    : isError
      ? IS_LOCAL_API
        ? 'Backend offline'
        : 'Server unavailable'
      : USE_MOCKS
        ? 'Demo data'
        : `Live · v${data.version}`

  return (
    <div className="status" data-state={state} title={USE_MOCKS ? 'Mock data' : API_URL}>
      <span className="status-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function AppHeader({ scenarioSearch }: { scenarioSearch?: string }) {
  return (
    <SiteHeader current="planner" workspace scenarioSearch={scenarioSearch}>
      <ApiStatus />
    </SiteHeader>
  )
}

/** How long the first health check may take before we explain the wait. */
export const SLOW_CONNECT_MS = 4000

/** True while `active` has lasted at least `ms` (the health check is pending only once). */
function useAfterDelay(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setElapsed(true), ms)
    return () => clearTimeout(timer)
  }, [active, ms])
  return active && elapsed
}

/** Explains a slow or unreachable API and offers a retry. */
export function BackendBanner() {
  const queryClient = useQueryClient()
  const { isError, isSuccess, isPending, isFetching } = useHealth()
  const wasDown = useRef(false)
  const slow = useAfterDelay(isPending, SLOW_CONNECT_MS)

  // Retry everything that failed while the backend was down, not just the health check.
  const retry = () =>
    queryClient.refetchQueries({ predicate: (query) => query.state.status === 'error' })

  useEffect(() => {
    if (isError) wasDown.current = true
    if (isSuccess && wasDown.current) {
      wasDown.current = false
      void queryClient.refetchQueries({ predicate: (query) => query.state.status === 'error' })
    }
  }, [isError, isSuccess, queryClient])

  if (USE_MOCKS) return null

  if (!IS_LOCAL_API && (slow || isError)) {
    return (
      <div className="banner banner-info" role="status">
        <div>
          <strong>Connecting to the server…</strong>
          <p>
            The API is taking longer than expected to respond. The page reconnects automatically
            when it becomes available.
          </p>
        </div>
        {isError && (
          <button type="button" className="secondary" onClick={retry} disabled={isFetching}>
            {isFetching ? 'Checking…' : 'Retry now'}
          </button>
        )}
      </div>
    )
  }

  if (!isError) return null

  return (
    <div className="banner" role="alert">
      <div>
        <strong>Can’t reach the backend at {API_URL}.</strong>
        <p>
          Start it from <code>backend/</code> with <code>uvicorn app.main:app --reload</code>, or
          set <code>VITE_USE_MOCKS=true</code> to browse with demo data.
        </p>
      </div>
      <button type="button" className="secondary" onClick={retry} disabled={isFetching}>
        {isFetching ? 'Checking…' : 'Retry'}
      </button>
    </div>
  )
}
