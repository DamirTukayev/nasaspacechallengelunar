import { latLonToGlobe, MOON_RADIUS_KM } from '../mission-control/globe'
import type { Vec3 } from './math'
export interface LunarSite {
  lat: number
  lon: number
  name: string
  siteId?: string
}
export function localAxes(site: Pick<LunarSite, 'lat' | 'lon'>): [Vec3, Vec3, Vec3] {
  const b = (site.lat * Math.PI) / 180,
    l = (site.lon * Math.PI) / 180
  return [
    [-Math.sin(l), 0, -Math.cos(l)],
    latLonToGlobe(site.lat, site.lon),
    [Math.sin(b) * Math.cos(l), -Math.cos(b), -Math.sin(b) * Math.sin(l)],
  ]
}
export function globeDirectionToLocal(v: Vec3, site: Pick<LunarSite, 'lat' | 'lon'>): Vec3 {
  return localAxes(site).map((a) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) as Vec3
}
/** Positions in lunar radii → the terrain API's east/up/south frame in kilometres. */
export function globePositionToLocal(
  v: Vec3,
  site: Pick<LunarSite, 'lat' | 'lon'>,
  altitudeKm = 0,
): Vec3 {
  const p = globeDirectionToLocal(v, site).map((x) => x * MOON_RADIUS_KM) as Vec3
  p[1] -= MOON_RADIUS_KM + altitudeKm
  return p
}
