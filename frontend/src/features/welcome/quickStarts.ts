import type { Site } from '../../api/types'
import {
  type Scenario,
  type ScenarioDraft,
  draftFromSite,
  initialDraft,
  validateDraft,
} from '../scenario/scenario'

export type QuickStart = 'south-pole' | 'polar-trio' | 'apollo-11'

export const QUICK_START_SITES: Record<QuickStart, string[]> = {
  'south-pole': ['south-pole'],
  'polar-trio': ['south-pole', 'mons-malapert', 'im-1'],
  'apollo-11': ['apollo-11'],
}

/** Drafts and validated scenarios for one quick start, on the default dates. */
export function quickStartScenarios(
  id: QuickStart,
  sites: Site[],
  now = new Date(),
): { drafts: ScenarioDraft[]; scenarios: Scenario[] } {
  const base = initialDraft(now)
  const drafts = QUICK_START_SITES[id]
    .map((siteId) => sites.find((s) => s.id === siteId))
    .filter((s) => s !== undefined)
    .map((site) => draftFromSite(base, site))
  const scenarios = drafts
    .map((d) => validateDraft(d).scenario)
    .filter((s): s is Scenario => s !== null)
  return { drafts, scenarios }
}

/** Every scenario a quick start can open, without duplicates: worth loading ahead of a click. */
export function allQuickStartScenarios(sites: Site[], now = new Date()): Scenario[] {
  const byKey = new Map<string, Scenario>()
  for (const id of Object.keys(QUICK_START_SITES) as QuickStart[]) {
    for (const s of quickStartScenarios(id, sites, now).scenarios) byKey.set(s.key, s)
  }
  return [...byKey.values()]
}
