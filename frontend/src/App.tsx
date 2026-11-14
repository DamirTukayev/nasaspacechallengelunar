import { API_URL, USE_MOCKS } from './api/client'
import { useHealth, useSites } from './api/queries'

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

function SiteList() {
  const { data, isPending, isError, error } = useSites()

  if (isPending) return <p className="muted">Loading sites…</p>
  if (isError) return <p className="error">Could not load sites: {error.message}</p>

  return (
    <ul className="sites">
      {data.map((site) => (
        <li key={site.id} className="site">
          <div className="site-name">{site.name}</div>
          <div className="muted">
            {site.lat.toFixed(3)}°, {site.lon.toFixed(3)}° · {site.group}
            {site.landing_date && ` · ${site.landing_date.slice(0, 4)}`}
          </div>
          <div className="site-description">{site.description}</div>
        </li>
      ))}
    </ul>
  )
}

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>Lunar Site Planner</h1>
        <ApiStatus />
      </header>
      <main>
        <h2>Landing sites</h2>
        <SiteList />
      </main>
    </div>
  )
}
