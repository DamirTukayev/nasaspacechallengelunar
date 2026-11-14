/**
 * Scene frame: x = east, y = up, z = south (so −z is north). Units are kilometres.
 * Azimuth is measured from north, clockwise; elevation above the horizontal.
 */
export function azElToVector(azDeg: number, elDeg: number): [number, number, number] {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)]
}

export type Vec3 = [number, number, number]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** Total length of the landing animation, seconds. */
export const DESCENT_SECONDS = 7

/** Where the descent starts above the site, km (scene units, before exaggeration). */
const START_ALTITUDE_KM = 4
/** The lander touches down this many seconds into the animation. */
export const TOUCHDOWN_SECONDS = 5
/**
 * The animation runs this much faster than a real powered descent from 4 km
 * (a couple of minutes); the descent HUD shows speeds in real time.
 */
export const DESCENT_TIME_SCALE = 30
/** Braking profile: altitude falls as (1 − p)^k, fast at first, then a slow final approach. */
const DESCENT_PROFILE = 2.2

const descentProgress = (seconds: number) => clamp01(seconds / TOUCHDOWN_SECONDS)
const thrustAt = (p: number) => (p < 1 ? 1 - p * 0.4 : 0)

export interface DescentFrame {
  /** Lander height above the ground, km. */
  landerAltitude: number
  /** 0…1 strength of the engine plume. */
  thrust: number
  camera: Vec3
  /** Done: the camera has settled into the overview position. */
  finished: boolean
}

/**
 * The landing sequence at `seconds` after it started:
 * 0–5 s the lander brakes down to the surface with the camera following,
 * 5–7 s the camera pulls back to the overview.
 */
export function descentFrame(seconds: number, overview: Vec3): DescentFrame {
  const touchdown = TOUCHDOWN_SECONDS
  const p = descentProgress(seconds)
  const landerAltitude = START_ALTITUDE_KM * (1 - p) ** DESCENT_PROFILE

  const approachStart: Vec3 = [9, 7, 12]
  const followOffset: Vec3 = [0.9, 0.35, 1.3]
  const follow: Vec3 = [followOffset[0], landerAltitude + followOffset[1], followOffset[2]]

  if (seconds < touchdown) {
    const camera = lerp3(approachStart, follow, easeInOut(clamp01(seconds / 2.5)))
    return { landerAltitude, thrust: thrustAt(p), camera, finished: false }
  }

  const back = clamp01((seconds - touchdown) / (DESCENT_SECONDS - touchdown))
  return {
    landerAltitude: 0,
    thrust: 0,
    camera: lerp3(follow, overview, easeInOut(back)),
    finished: back >= 1,
  }
}

export interface DescentTelemetry {
  altitudeM: number
  /** Downward speed in real time (the animation is sped up), m/s. */
  descentRateMs: number
  /** 0…1 engine thrust. */
  thrust: number
  touchedDown: boolean
}

/** What the descent HUD reads at `seconds` into the landing animation. */
export function descentTelemetry(seconds: number): DescentTelemetry {
  const p = descentProgress(seconds)
  const altitudeM = START_ALTITUDE_KM * 1000 * (1 - p) ** DESCENT_PROFILE
  // d(altitude)/dt of the animation, slowed back down to real time.
  const animationRate =
    (START_ALTITUDE_KM * 1000 * DESCENT_PROFILE * (1 - p) ** (DESCENT_PROFILE - 1)) /
    TOUCHDOWN_SECONDS
  return {
    altitudeM,
    descentRateMs: animationRate / DESCENT_TIME_SCALE,
    thrust: thrustAt(p),
    touchedDown: p >= 1,
  }
}
