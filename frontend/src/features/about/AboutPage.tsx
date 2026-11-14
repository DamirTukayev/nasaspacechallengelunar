import { useEffect } from 'react'
import heroUrl from '../../assets/about/lunar-hero.webp'
import { TeamAvatar } from './TeamAvatar'
import { Link } from '../../components/ui/Link'
import { MoonLogo } from '../../components/ui/MoonLogo'
import { GithubIcon } from '../../components/ui/GithubIcon'
import { TEAM } from './team'
import './about.css'

const CHALLENGE_URL =
  'https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/'
const REPOSITORY_URL = 'https://github.com/DamirTukayev/nasaspacechallengelunar'

const SOURCES = [
  {
    name: 'JPL Horizons',
    detail: 'Sun and Earth positions as seen from the lunar surface.',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
  },
  {
    name: 'LRO LOLA',
    detail: 'Lunar elevation data for terrain and the local skyline.',
    url: 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm',
  },
  {
    name: 'LROC',
    detail: 'Lunar imagery and local stereo terrain where available.',
    url: 'https://www.lroc.asu.edu/',
  },
  {
    name: 'NASA SVS Moon Kit',
    detail: 'Colour and relief maps used by the application’s lunar globe.',
    url: 'https://svs.gsfc.nasa.gov/4720/',
  },
]

export default function AboutPage() {
  useEffect(() => {
    const previous = document.title
    document.title = 'About | Noctis Horizon'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="about-page">
      <a className="about-skip" href="#about-main">
        Skip to content
      </a>
      <header className="about-header">
        <a className="about-brand" href="/?show=0" aria-label="Noctis Horizon planner">
          <MoonLogo className="about-brand-logo" />
          <span>Noctis Horizon</span>
        </a>
        <nav aria-label="Main navigation">
          <Link variant="nav" href="/?show=0">
            Planner
          </Link>
          <Link variant="nav" href="/?show=1">
            Mission Control
          </Link>
          <Link variant="nav" href="/about" aria-current="page">
            About
          </Link>
        </nav>
      </header>

      <main id="about-main">
        <section className="about-hero ui-inverse" aria-labelledby="about-title">
          <img className="about-hero-image" src={heroUrl} alt="" fetchPriority="high" />
          <div className="about-hero-content">
            <p className="about-byline">Built by Noctis Expelled</p>
            <h1 id="about-title">Noctis Horizon</h1>
            <p className="about-subtitle">Lunar sunlight and Earth visibility planner.</p>
            <p className="about-intro">
              Compare landing sites and dates to explore sunlight and direct-to-Earth communication
              windows.
            </p>
            <div className="about-actions">
              <Link variant="primary" href="/?show=0">
                Open planner
              </Link>
              <Link variant="outline" href={CHALLENGE_URL} external>
                Explore the challenge
              </Link>
            </div>
          </div>
        </section>

        <div className="about-content">
          <section className="about-story" aria-label="The project">
            <article>
              <h2>The challenge</h2>
              <p>
                At the lunar south pole, terrain can hide the Sun and the Earth. Location and timing
                shape the available light and communication windows.
              </p>
              <p>
                A change in landing date or position means checking those conditions again. We want
                to make that comparison easier for mission planners, educators, and curious
                visitors.
              </p>
            </article>
            <article>
              <h2>Our approach</h2>
              <p>
                We combine JPL Horizons ephemerides with lunar terrain data to show the Sun and
                Earth relative to the local skyline.
              </p>
              <p>
                Explore a site in 3D, follow visibility through time, and compare scenarios. A
                shared view connects the terrain, the numbers, and the conditions behind each
                result.
              </p>
            </article>
          </section>

          <section className="about-capabilities" aria-labelledby="capabilities-title">
            <div className="about-section-heading">
              <h2 id="capabilities-title">Explore landing conditions.</h2>
              <p>Three ways to explore a landing scenario.</p>
            </div>
            <div className="about-capability-grid">
              <article>
                <span className="about-feature-number" aria-hidden="true">
                  01
                </span>
                <h3>Explore the skyline</h3>
                <p>
                  See how nearby terrain changes the view of the Sun and Earth from a landing site.
                </p>
              </article>
              <article>
                <span className="about-feature-number" aria-hidden="true">
                  02
                </span>
                <h3>Follow the windows</h3>
                <p>
                  Inspect sunlight, direct Earth visibility, and the intervals when both are
                  available.
                </p>
              </article>
              <article>
                <span className="about-feature-number" aria-hidden="true">
                  03
                </span>
                <h3>Compare alternatives</h3>
                <p>
                  Try another place or date and compare the conditions for different mission
                  scenarios.
                </p>
              </article>
            </div>
          </section>

          <section className="about-team" aria-labelledby="team-title">
            <div className="about-section-heading">
              <div>
                <h2 id="team-title">Meet Noctis Expelled</h2>
                <p>The team behind Noctis Horizon. Based in Kazakhstan.</p>
              </div>
              <span className="about-team-count">6 people, one project</span>
            </div>
            <div className="about-team-grid">
              {TEAM.map((member, index) => (
                <article className="about-person" key={member.name}>
                  <div className="about-person-art">
                    <TeamAvatar initials={member.initials} index={index} />
                    {'owner' in member && <span className="about-owner">Team Owner</span>}
                  </div>
                  <div className="about-person-text">
                    <h3>{member.name}</h3>
                    <p className="about-person-role">{member.role}</p>
                    <p className="about-person-contribution">{member.contribution}</p>
                    {'github' in member && (
                      <Link
                        className="about-person-link"
                        href={`https://github.com/${member.github}`}
                        external
                        aria-label={`GitHub profile: ${member.name}`}
                      >
                        <GithubIcon /> GitHub
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="about-data" aria-labelledby="sources-title">
            <div className="about-section-heading">
              <h2 id="sources-title">Open data, visible assumptions.</h2>
              <p>The sources behind the application’s calculations and visualizations.</p>
            </div>
            <div className="about-sources-grid">
              {SOURCES.map((source) => (
                <a key={source.name} href={source.url} target="_blank" rel="noreferrer">
                  <h3>
                    {source.name} <span aria-hidden="true">↗</span>
                  </h3>
                  <p>{source.detail}</p>
                </a>
              ))}
            </div>
            <aside className="about-limits" aria-labelledby="limits-title">
              <h3 id="limits-title">An exploratory tool</h3>
              <p>
                Earth visibility describes a geometric line of sight, not a complete radio-link
                budget. Sunlight visibility does not model a lander’s full power or thermal system.
                Terrain coverage and resolution vary by site; the application identifies simplified
                terrain where detailed data is unavailable.
              </p>
              <p>
                The decorative Moon image on this page is an illustration. The planner’s terrain and
                visibility results use the data sources above.
              </p>
            </aside>
          </section>

          <section className="about-closing" aria-labelledby="closing-title">
            <div>
              <h2 id="closing-title">Explore the next scenario.</h2>
              <p>Choose a landing site and see how the conditions change.</p>
            </div>
            <Link variant="primary" href="/?show=0">
              Open planner
            </Link>
          </section>
        </div>
      </main>
      <footer className="about-footer">
        <div>
          <strong>Noctis Horizon</strong>
          <span>Built by Noctis Expelled</span>
        </div>
        <div>
          <a href={CHALLENGE_URL} target="_blank" rel="noreferrer">
            Lunar Landing Site Navigator ↗
          </a>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            Source code ↗
          </a>
          <p>Built for NASA Space Apps Challenge. Not an official NASA product.</p>
        </div>
      </footer>
    </div>
  )
}
