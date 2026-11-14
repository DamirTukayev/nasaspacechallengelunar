import { CUSTOM_SITE, type Scenario } from '../scenario/scenario'

/** 'show' is the fullscreen Mission Control, 'planner' the regular interface. */
export type AppMode = 'show' | 'planner'

export const MODE_STORAGE_KEY = 'lunar-site-planner:mode'

/**
 * Which screen a visit starts on.
 *
 * - `?show=1` / `?show=0` force Mission Control / the planner;
 * - a shared scenario link (`?s=` or `?c=`) opens the planner, where it was shared from;
 * - otherwise the visitor's last choice, and Mission Control for a first visit.
 */
export function initialMode(search: string, stored: string | null): AppMode {
  const params = new URLSearchParams(search)
  const show = params.get('show')
  if (show === '1') return 'show'
  if (show === '0') return 'planner'
  if (params.has('s') || params.has('c')) return 'planner'
  return stored === 'planner' ? 'planner' : 'show'
}

export function readStoredMode(): string | null {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY)
  } catch {
    return null // storage blocked: behave like a first visit
  }
}

export function storeMode(mode: AppMode): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // Not remembered; the next visit simply starts in Mission Control again.
  }
}

/** The sites Mission Control cycles through with the number keys. */
export const SHOW_SITE_IDS = ['south-pole', 'mons-malapert', 'im-1'] as const

/**
 * Scenarios offered in Mission Control: the one already open in the planner first (if any),
 * then the polar showcase sites, without repeating a site.
 */
export function showScenarios(current: Scenario | null, showcase: Scenario[]): Scenario[] {
  const list = current ? [current] : []
  for (const s of showcase) {
    if (!list.some((x) => x.key === s.key || (x.siteId === s.siteId && x.siteId !== CUSTOM_SITE))) {
      list.push(s)
    }
  }
  return list.slice(0, 4)
}
