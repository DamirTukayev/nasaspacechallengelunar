import { useEffect } from 'react'
import heroUrl from '../../assets/about/lunar-hero.webp'
import { SiteHeader } from '../../components/SiteHeader'
import { SiteFooter } from '../../components/SiteFooter'
import { Link } from '../../components/ui/Link'
import './home.css'

const CAPABILITIES = [
  {
    title: 'Explore the skyline',
    text: 'See how nearby terrain changes the view of the Sun and Earth from a landing site.',
  },
  {
    title: 'Follow the windows',
    text: 'Inspect sunlight, direct Earth visibility, and the intervals when both are available.',
  },
  {
    title: 'Compare alternatives',
    text: 'Try another place or date and compare the conditions for different mission scenarios.',
  },
]

export default function HomePage() {
  useEffect(() => {
    document.title = 'Noctis Horizon | Lunar landing planner'
  }, [])
  return (
    <div className="site-page home-page">
      <a className="site-skip" href="#home-main">
        Skip to content
      </a>
      <SiteHeader current="home" />
      <main id="home-main">
        <section className="home-hero ui-inverse" aria-labelledby="home-title">
          <img className="home-hero-image" src={heroUrl} alt="" fetchPriority="high" />
          <div className="home-hero-content">
            <p className="home-byline">Built by Noctis Expelled</p>
            <h1 id="home-title">Noctis Horizon</h1>
            <p className="home-subtitle">Lunar sunlight and Earth visibility planner.</p>
            <p className="home-intro">
              Compare landing sites and dates to explore sunlight and direct-to-Earth communication
              windows.
            </p>
            <div className="home-actions">
              <Link variant="primary" href="/mission-control?demo=1">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 2L14 8L4 14Z" fill="currentColor" />
                </svg>
                Watch demo
              </Link>
              <Link variant="outline" href="/planner">
                Open planner
              </Link>
            </div>
          </div>
        </section>
        <div className="home-content">
          <section className="home-capabilities" aria-labelledby="capabilities-title">
            <h2 id="capabilities-title">Explore landing conditions.</h2>
            <p className="home-section-intro">Three ways to explore a landing scenario.</p>
            <div className="home-capability-grid">
              {CAPABILITIES.map(({ title, text }) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="home-project" aria-labelledby="project-title">
            <div>
              <h2 id="project-title">The project and the people behind it.</h2>
              <p>
                Meet the team, explore our approach, and see the data sources behind the planner.
              </p>
            </div>
            <Link variant="outline" href="/about">
              About the project
            </Link>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
