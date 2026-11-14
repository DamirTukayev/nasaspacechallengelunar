import type { Vec3 } from '../scene3d/math'

/** Mean lunar radius, km. */
export const MOON_RADIUS_KM = 1737.4

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const length = (a: Vec3) => Math.sqrt(dot(a, a))
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a))
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** The part of `v` perpendicular to the unit vector `n`. */
const reject = (v: Vec3, n: Vec3): Vec3 => add(v, scale(n, -dot(v, n)))

/** Spherical interpolation between unit vectors (straight blend when nearly parallel). */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const cos = Math.min(Math.max(dot(a, b), -1), 1)
  const angle = Math.acos(cos)
  if (angle < 1e-4) return normalize(add(scale(a, 1 - t), scale(b, t)))
  const s = Math.sin(angle)
  return add(scale(a, Math.sin((1 - t) * angle) / s), scale(b, Math.sin(t * angle) / s))
}

/**
 * Globe frame, lunar radius = 1: +y is the north pole, +x points to 0° longitude (towards
 * the Earth), −z to 90°E. This is how three.js wraps an equirectangular map around a sphere.
 */
export function latLonToGlobe(latDeg: number, lonDeg: number): Vec3 {
  const b = rad(latDeg)
  const l = rad(lonDeg)
  return [Math.cos(b) * Math.cos(l), Math.sin(b), -Math.cos(b) * Math.sin(l)]
}

export function globeToLatLon(v: Vec3): { lat: number; lon: number } {
  const n = normalize(v)
  return { lat: deg(Math.asin(n[1])), lon: deg(Math.atan2(-n[2], n[0])) }
}

/**
 * A direction seen from a site (azimuth from north, clockwise; elevation above the horizontal)
 * expressed in the globe frame. The Sun and the Earth are far enough for the site and the
 * Moon's centre to see them in the same direction.
 */
export function azElToGlobe(latDeg: number, lonDeg: number, azDeg: number, elDeg: number): Vec3 {
  const b = rad(latDeg)
  const l = rad(lonDeg)
  const az = rad(azDeg)
  const el = rad(elDeg)
  const east: Vec3 = [-Math.sin(l), 0, -Math.cos(l)]
  const north: Vec3 = [-Math.sin(b) * Math.cos(l), Math.cos(b), Math.sin(b) * Math.sin(l)]
  const up = latLonToGlobe(latDeg, lonDeg)
  return add(
    add(scale(east, Math.cos(el) * Math.sin(az)), scale(north, Math.cos(el) * Math.cos(az))),
    scale(up, Math.sin(el)),
  )
}

/** Length of the orbital approach, seconds; a local camera approach follows. */
export const FLIGHT_SECONDS = 6.5
/** A still moment on the whole Moon before the camera starts to move. */
const HOLD_SECONDS = 0.7
/** Camera altitude at the start, lunar radii: the whole disc fills the view. */
const START_ALTITUDE = 3
/** How far from the site, towards the Sun, the flight starts. */
const START_ANGLE_DEG = 55
/** The final, oblique view: this high above the site and this far back along the track. */
const END_ALTITUDE = 0.1
const END_BACK = 0.16

export interface FlightPlan {
  site: Vec3
  /** Camera direction (unit) at the start. */
  start: Vec3
  /** Camera position at the end. */
  end: Vec3
  /**
   * The camera, its target and so its line of sight all stay in one plane through the Moon's
   * centre. Screen "up" is the perpendicular to the line of sight within that plane, rolled
   * by `startRoll` (fading to zero) so the first shot has the Moon's north up.
   */
  normal: Vec3
  startRoll: number
}

/**
 * The flight starts over the sunlit side, towards the Sun from the site, so the first shot
 * is a bright Moon; it ends low and behind the site, looking at it with the limb in view.
 */
export function planFlight(site: Vec3, sun: Vec3): FlightPlan {
  let towardSun = reject(sun, site)
  // The Sun straight overhead (or under foot): any direction along the surface will do.
  if (length(towardSun) < 0.1)
    towardSun = reject(Math.abs(site[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], site)
  const along = normalize(towardSun)

  const a = rad(START_ANGLE_DEG)
  const start = normalize(add(scale(site, Math.cos(a)), scale(along, Math.sin(a))))
  const end = add(scale(site, 1 + END_ALTITUDE), scale(along, END_BACK))

  // Pick the side of the plane that ends with up = away from the surface.
  let normal = normalize(cross(start, site))
  if (dot(cross(normal, normalize(add(site, scale(end, -1)))), site) < 0) normal = scale(normal, -1)

  let north = reject([0, 1, 0], start)
  if (length(north) < 0.1) north = reject([1, 0, 0], start)
  const view = scale(start, -1)
  const trackUp = cross(normal, view)
  const startRoll = Math.atan2(dot(cross(trackUp, normalize(north)), view), dot(trackUp, north))
  return { site, start, end, normal, startRoll }
}

export interface FlightFrame {
  camera: Vec3
  target: Vec3
  up: Vec3
  /** Camera height above the mean surface, km. */
  altitudeKm: number
  finished: boolean
}

/** The camera at `seconds` into the flight. */
export function flightFrame(plan: FlightPlan, seconds: number): FlightFrame {
  const p = easeInOut(clamp01((seconds - HOLD_SECONDS) / (FLIGHT_SECONDS - HOLD_SECONDS)))
  const endDistance = length(plan.end)
  const endAltitude = endDistance - 1

  const direction = slerp(plan.start, normalize(plan.end), p)
  // Altitude falls geometrically: the approach keeps the same feel at every scale.
  const altitude = START_ALTITUDE * (endAltitude / START_ALTITUDE) ** p
  const camera = scale(direction, 1 + altitude)
  // The gaze slides from the Moon's centre to the site.
  const target = scale(plan.site, p * p * (3 - 2 * p))

  // Rotate the in-plane up about the line of sight (Rodrigues; the axis is perpendicular).
  const view = normalize(add(target, scale(camera, -1)))
  const trackUp = cross(plan.normal, view)
  const roll = plan.startRoll * (1 - p)
  const up = add(scale(trackUp, Math.cos(roll)), scale(cross(view, trackUp), Math.sin(roll)))

  return {
    camera,
    target,
    up,
    altitudeKm: altitude * MOON_RADIUS_KM,
    finished: seconds >= FLIGHT_SECONDS,
  }
}
