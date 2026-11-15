import { appHref, type SitePage } from '../lib/navigation'
import { Link } from './ui/Link'

export function SiteNavigation({
  current,
  compact = false,
  scenarioSearch = '',
}: {
  current: SitePage
  compact?: boolean
  scenarioSearch?: string
}) {
  const links = [
    { page: 'home', label: 'Home', href: '/' },
    { page: 'planner', label: 'Planner', href: appHref('planner', scenarioSearch) },
    {
      page: 'mission-control',
      label: 'Mission Control',
      href: appHref('show', scenarioSearch),
    },
    { page: 'about', label: 'About', href: '/about' },
  ]
  return (
    <nav className="site-nav" aria-label="Main navigation">
      {links.map((link) => (
        <Link
          key={link.page}
          href={link.href}
          variant="nav"
          size={compact ? 'compact' : 'normal'}
          aria-current={current === link.page ? 'page' : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
