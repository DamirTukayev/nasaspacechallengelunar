import { appHref } from '../../lib/navigation'
import { CUSTOM_SITE, validateDraft } from '../scenario/scenario'
import { encodeScenario } from '../share/shareUrl'
import type { LandingSearch } from './landing'

export type LandingPresentation = 'scene' | 'map'

export function landingPresentation(search: string): LandingPresentation {
  return new URLSearchParams(search).get('landing-view') === 'map' ? 'map' : 'scene'
}

/** The candidate continues with the dates of the displayed result, including offline results. */
export function candidateHref(
  data: LandingSearch,
  index: number,
  mode: 'planner' | 'show',
  context = '',
): string | null {
  if (!Number.isInteger(index) || !data.points.eligible[index]) return null
  const { scenario } = validateDraft({
    siteId: CUSTOM_SITE,
    name: '',
    lat: String(data.points.lat[index]),
    lon: String(data.points.lon[index]),
    start: data.period_start.slice(0, 16),
    end: data.period_end.slice(0, 16),
    stepMinutes: data.step_minutes,
  })
  if (!scenario) return null
  const params = new URLSearchParams(context)
  params.set('s', encodeScenario(scenario))
  params.delete('v')
  return appHref(mode, params.toString())
}
