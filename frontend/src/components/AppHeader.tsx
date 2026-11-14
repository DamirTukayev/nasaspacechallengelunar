import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { API_URL, IS_LOCAL_API, USE_MOCKS } from '../api/client'
import { useHealth } from '../api/queries'

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id="logo-moon" cx="35%" cy="35%" r="70%">
          <stop offset="0" stopColor="#e9ecf2" />
          <stop offset="1" stopColor="#8a93a6" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="15" fill="url(#logo-moon)" />
      <circle cx="14" cy="16" r="3" fill="#7a8396" opacity="0.6" />
      <circle cx="24" cy="25" r="4" fill="#7a8396" opacity="0.5" />
      <circle cx="25" cy="13" r="1.8" fill="#7a8396" opacity="0.5" />
      {/* The Sun's light grazing the pole */}
      <path d="M3 33 Q20 28 37 33" stroke="#f5c542" strokeWidth="2" fill="none" />
    </svg>
  )
}

function ApiStatus() {
  const { data, isPending, isError } = useHealth()

  const state = isPending ? 'pending' : isError ? 'error' : 'ok'
  const label = isPending
    ? IS_LOCAL_API
      ? 'Connecting…'
      : 'Waking up…'
    : isError
      ? IS_LOCAL_API
        ? 'Backend offline'
        : 'Server waking up'
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

export function AppHeader({ onMissionControl }: { onMissionControl?: () => void }) {
  return (
    <header className="header">
      <div className="brand">
        <Logo />
        <div>
          <h1>Lunar Site Planner</h1>
          <p className="tagline">Sunlight and Earth contact for any landing site and date</p>
        </div>
      </div>
      <div className="header-actions">
        {onMissionControl && (
          <button type="button" className="secondary" onClick={onMissionControl}>
            ▶ Mission Control
          </button>
        )}
        <ApiStatus />
      </div>
    </header>
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

/** Explains a slow or unreachable backend: a sleeping demo server, or a local one not started. */
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
          <strong>Waking up the demo server…</strong>
          <p>
            It runs on free hosting that sleeps when nobody is using it. Starting again can take up
            to a minute. The page connects by itself as soon as it is ready.
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
