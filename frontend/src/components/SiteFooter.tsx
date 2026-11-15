import { CHALLENGE_URL, REPOSITORY_URL } from '../lib/project'
import { GithubIcon } from './ui/GithubIcon'
import { Link } from './ui/Link'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Link className="site-footer-brand" href="/">
          Noctis Horizon
        </Link>
        <p>Built by Noctis Expelled</p>
      </div>
      <div className="site-footer-detail">
        <nav aria-label="Project links">
          <Link href="/about">About the project</Link>
          <Link href={CHALLENGE_URL} external>
            Lunar Landing Site Navigator
          </Link>
          <Link href={REPOSITORY_URL} external>
            <GithubIcon /> Source code
          </Link>
        </nav>
        <p>Built for NASA Space Apps Challenge. Not an official NASA product.</p>
      </div>
    </footer>
  )
}
