import { lazy } from 'react'

const App = lazy(() => import('./App'))
const AboutPage = lazy(() => import('./features/about/AboutPage'))

/** Ordinary links preserve browser history and direct page loads without a router dependency. */
export default function Page() {
  return /^\/about\/?$/.test(window.location.pathname) ? <AboutPage /> : <App />
}
