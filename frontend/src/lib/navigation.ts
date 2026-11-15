import { type AppMode, initialMode } from '../features/mission-control/mode'

export type SitePage = 'home' | 'about' | 'planner' | 'mission-control' | 'not-found'

/** Explicit paths win over old mode flags; root scenario links remain usable. */
export function pageForLocation(pathname: string, search: string): SitePage {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/about') return 'about'
  if (path === '/planner') return 'planner'
  if (path === '/mission-control') return 'mission-control'
  if (path !== '/') return 'not-found'

  const params = new URLSearchParams(search)
  if (['show', 'demo', 's', 'c'].some((key) => params.has(key))) {
    return initialMode(search, null) === 'show' ? 'mission-control' : 'planner'
  }
  if (isLandingSearchRequested(search)) return 'planner'
  return 'home'
}

/** A scenario search string can be carried between tools without legacy mode flags. */
export function appHref(mode: AppMode, search = '', demo = false): string {
  const params = new URLSearchParams(search)
  params.delete('show')
  params.delete('demo')
  params.delete('tool')
  params.delete('t')
  if (mode === 'show' && demo) params.set('demo', '1')
  const query = params.toString()
  return `${mode === 'show' ? '/mission-control' : '/planner'}${query ? `?${query}` : ''}`
}

export function isLandingSearchRequested(search: string): boolean {
  return new URLSearchParams(search).get('tool') === 'landing-search'
}

/** Planner tools share the same analysis context, with a stable direct-entry address. */
export function plannerHref(search = '', tool: 'analysis' | 'landing-search' = 'analysis'): string {
  const href = appHref('planner', search)
  if (tool === 'analysis') return href
  const offset = Number(new URLSearchParams(search).get('t'))
  const rehearsal = Number.isFinite(offset) && offset > 0 ? `&t=${offset}` : ''
  return `${href}${href.includes('?') ? '&' : '?'}tool=landing-search${rehearsal}`
}
