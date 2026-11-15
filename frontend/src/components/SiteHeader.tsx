import type { ReactNode } from 'react'
import type { SitePage } from '../lib/navigation'
import { SiteNavigation } from './SiteNavigation'
import { Link } from './ui/Link'
import { MoonLogo } from './ui/MoonLogo'

export function SiteHeader({
  current,
  workspace = false,
  scenarioSearch,
  children,
}: {
  current: SitePage
  workspace?: boolean
  scenarioSearch?: string
  children?: ReactNode
}) {
  return (
    <header className={`site-header${workspace ? ' site-header-workspace ui-inverse' : ''}`}>
      <Link className="site-brand" href="/" aria-label="Noctis Horizon home">
        <MoonLogo className="site-brand-logo" />
        <span>
          <span className="site-brand-name">Noctis Horizon</span>
          {workspace && (
            <span className="site-brand-tagline">
              Sunlight and Earth contact for any landing site and date
            </span>
          )}
        </span>
      </Link>
      <SiteNavigation current={current} scenarioSearch={scenarioSearch} />
      {children && <div className="site-header-tools">{children}</div>}
    </header>
  )
}
