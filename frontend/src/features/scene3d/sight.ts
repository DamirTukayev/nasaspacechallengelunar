import type { HorizonResponse } from '../../api/types'
import type { Vec3 } from './math'
import { azElToVector } from './math'

const MOON_RADIUS_KM = 1737.4
/** Below the skyline by more than this, the body is simply below the horizon (night). */
const BELOW_HORIZON_MARGIN_DEG = 1.5

const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
]

export function compassPoint(azDeg: number): string {
  const az = ((azDeg % 360) + 360) % 360
  return COMPASS[Math.round(az / 22.5) % 16]
}

export interface Blocker {
  distanceKm: number
  bearing: string
  /** Skyline elevation in that direction. */
  skylineDeg: number
  /** Terrain at the blocking point, relative to the site's ground. */
  heightAboveSiteM: number
  /** Scene position (km, x east, y up, z south), with the Moon's curvature. */
  position: Vec3
}

export type Sight =
  | { kind: 'visible'; direction: Vec3; diskFraction: number }
  | { kind: 'blocked'; direction: Vec3; blocker: Blocker | null }
  | { kind: 'below'; elevationDeg: number }

/** The skyline hit point in the direction of `azDeg`, in scene coordinates. */
export function blockerAt(
  horizon: HorizonResponse,
  azDeg: number,
  exaggeration = 1,
): Blocker | null {
  const hits = horizon.hits
  if (!hits || horizon.site_alt_m === null || horizon.azimuths.length < 2) return null
  const step = horizon.azimuths[1] - horizon.azimuths[0]
  const n = horizon.azimuths.length
  const i = Math.round((((azDeg % 360) + 360) % 360) / step) % n

  const distance = hits.distance_m[i]
  const height = hits.height_m[i]
  if (distance === null || height === null) return null

  const d = distance / 1000
  const az = (horizon.azimuths[i] * Math.PI) / 180
  const rise = (height - horizon.site_alt_m) / 1000
  // The ground curves away: a point d km off sits d²/2R lower than the local horizontal.
  const y = (rise - (d * d) / (2 * MOON_RADIUS_KM)) * exaggeration
  return {
    distanceKm: d,
    bearing: compassPoint(horizon.azimuths[i]),
    skylineDeg: horizon.elevations[i],
    heightAboveSiteM: height - horizon.site_alt_m,
    position: [d * Math.sin(az), y, -d * Math.cos(az)],
  }
}

/**
 * Line of sight from the site to the Sun or the Earth.
 * `visible` and `diskFraction` come from the analysis (the full 200 km skyline); the horizon
 * only says where the terrain stands in the way.
 */
export function sightOf(
  azDeg: number,
  elDeg: number,
  visible: boolean,
  skylineDeg: number,
  horizon: HorizonResponse | undefined,
  diskFraction = 1,
  exaggeration = 1,
): Sight {
  const direction = azElToVector(azDeg, elDeg)
  if (visible) return { kind: 'visible', direction, diskFraction }
  if (elDeg < Math.min(0, skylineDeg) - BELOW_HORIZON_MARGIN_DEG) {
    return { kind: 'below', elevationDeg: elDeg }
  }
  return {
    kind: 'blocked',
    direction,
    blocker: horizon ? blockerAt(horizon, azDeg, exaggeration) : null,
  }
}

function formatDistance(km: number): string {
  return km < 1
    ? `${Math.round(km * 1000)} m`
    : km < 10
      ? `${km.toFixed(1)} km`
      : `${km.toFixed(0)} km`
}

/** One line for the HUD: "Hidden by terrain 12 km SW (skyline +3.1°)". */
export function describeSight(sight: Sight): string {
  if (sight.kind === 'visible') {
    return sight.diskFraction < 0.999
      ? `Partly above the skyline: ${(sight.diskFraction * 100).toFixed(0)}% of the disk`
      : 'Clear line of sight'
  }
  if (sight.kind === 'below') return `Below the horizon (${sight.elevationDeg.toFixed(0)}°)`
  if (!sight.blocker) return 'Hidden by terrain'
  const { distanceKm, bearing, skylineDeg } = sight.blocker
  const sign = skylineDeg >= 0 ? '+' : ''
  return `Hidden by terrain ${formatDistance(distanceKm)} ${bearing} (skyline ${sign}${skylineDeg.toFixed(1)}°)`
}
