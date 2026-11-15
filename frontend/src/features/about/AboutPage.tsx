import { useEffect } from 'react'
import { TeamAvatar } from './TeamAvatar'
import { Link } from '../../components/ui/Link'
import { SiteHeader } from '../../components/SiteHeader'
import { SiteFooter } from '../../components/SiteFooter'
import { GithubIcon } from '../../components/ui/GithubIcon'
import { TEAM } from './team'
import './about.css'

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
    <div className="site-page about-page">
      <a className="site-skip" href="#about-main">
        Skip to content
      </a>
      <SiteHeader current="about" />

      <main id="about-main">
        <div className="about-content">
          <header className="about-introduction">
            <h1>About Noctis Horizon</h1>
            <p>A lunar landing planner built by Noctis Expelled, a team of six from Kazakhstan.</p>
          </header>
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
                <Link className="about-source-link" key={source.name} href={source.url} external>
                  <h3>{source.name}</h3>
                  <p>{source.detail}</p>
                </Link>
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
                The decorative Moon image on the home page is an illustration. The planner’s terrain
                and visibility results use the data sources above.
              </p>
            </aside>
          </section>

          <section className="about-closing" aria-labelledby="closing-title">
            <div>
              <h2 id="closing-title">Explore the next scenario.</h2>
              <p>Choose a landing site and see how the conditions change.</p>
            </div>
            <Link variant="primary" href="/planner">
              Open planner
            </Link>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
