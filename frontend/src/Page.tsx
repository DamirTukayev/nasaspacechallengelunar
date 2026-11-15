import { lazy } from 'react'
import { SiteHeader } from './components/SiteHeader'
import { SiteFooter } from './components/SiteFooter'
import { Link } from './components/ui/Link'
import { pageForLocation } from './lib/navigation'

const App = lazy(() => import('./App'))
const AboutPage = lazy(() => import('./features/about/AboutPage'))
const HomePage = lazy(() => import('./features/home/HomePage'))

/** Ordinary links preserve browser history and direct page loads without a router dependency. */
export default function Page() {
  const page = pageForLocation(window.location.pathname, window.location.search)
  if (page === 'home') return <HomePage />
  if (page === 'about') return <AboutPage />
  if (page === 'planner' || page === 'mission-control') {
    return <App mode={page === 'planner' ? 'planner' : 'show'} />
  }
  return (
    <div className="site-page">
      <SiteHeader current="not-found" />
      <main className="not-found">
        <h1>Page not found</h1>
        <p>Use the navigation above or return to the project home page.</p>
        <Link variant="primary" href="/">
          Go home
        </Link>
      </main>
      <SiteFooter />
    </div>
  )
}
