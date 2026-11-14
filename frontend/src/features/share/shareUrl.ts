/**
 * The open scenario, the comparison and the tab, kept in the page URL so a link reopens them.
 *
 *   ?s=mons-malapert,2026-11-14T00:00,2026-12-13T12:44,60     the scenario on screen
 *   &c=south-pole,…&c=-89.5~10,…                              compared scenarios, in order
 *   &v=compare                                                the Compare tab (Details if absent)
 *
 * A scenario is `<site>,<start>,<end>,<step minutes>`, times in UTC. The site is a catalog id,
 * or `<lat>~<lon>` for custom coordinates.
 */
import type { Site } from '../../api/types'
import { fromUtcInput, toUtcInput } from '../../lib/time'
import {
  CUSTOM_SITE,
  STEP_OPTIONS,
  type Scenario,
  type ScenarioDraft,
  draftFromSite,
  validateDraft,
} from '../scenario/scenario'

export type View = 'details' | 'compare'

export interface SharedState {
  active: Scenario | null
  compared: Scenario[]
  view: View
}

/** Matches MAX_COMPARED; anything beyond it in a hand-edited link is dropped. */
const MAX_SHARED_COMPARED = 4

export function encodeScenario(s: Scenario): string {
  const { lat, lon, start, end, step_minutes } = s.request
  const site = s.siteId === CUSTOM_SITE ? `${lat}~${lon}` : s.siteId
  return [site, toUtcInput(new Date(start)), toUtcInput(new Date(end)), step_minutes].join(',')
}

/** A valid scenario, or null for anything malformed, unknown or out of range. */
export function decodeScenario(token: string, sites: Site[]): Scenario | null {
  const parts = token.split(',')
  if (parts.length !== 4) return null
  const [site, start, end, stepRaw] = parts
  const stepMinutes = Number(stepRaw)
  if (!STEP_OPTIONS.some((o) => o.minutes === stepMinutes)) return null
  if (!fromUtcInput(start) || !fromUtcInput(end)) return null

  const times = { start, end, stepMinutes }
  let draft: ScenarioDraft
  if (site.includes('~')) {
    const [lat, lon] = site.split('~')
    draft = { siteId: CUSTOM_SITE, name: '', lat, lon, ...times }
  } else {
    const known = sites.find((s) => s.id === site)
    if (!known) return null
    draft = draftFromSite({ siteId: '', name: '', lat: '', lon: '', ...times }, known)
  }
  return validateDraft(draft).scenario
}

export function stateToSearch({ active, compared, view }: SharedState): string {
  const parts: string[] = []
  if (active) parts.push(`s=${encodeScenario(active)}`)
  for (const s of compared) parts.push(`c=${encodeScenario(s)}`)
  if (view === 'compare' && compared.length > 0) parts.push('v=compare')
  // Keep ',', ':' and '~' readable: they are legal in a query string.
  return parts.length ? `?${parts.map((p) => encodeURI(p)).join('&')}` : ''
}

/** What a URL asks for. Unknown or broken entries are skipped, never fatal. */
export function searchToState(search: string, sites: Site[]): SharedState {
  const params = new URLSearchParams(search)
  const token = params.get('s')
  const active = token ? decodeScenario(token, sites) : null

  const seen = new Set<string>()
  const compared: Scenario[] = []
  for (const t of params.getAll('c')) {
    const s = decodeScenario(t, sites)
    if (s && !seen.has(s.key) && compared.length < MAX_SHARED_COMPARED) {
      seen.add(s.key)
      compared.push(s)
    }
  }

  const view: View = params.get('v') === 'compare' && compared.length > 0 ? 'compare' : 'details'
  return { active, compared, view }
}
