/**
 * The sky dome (W5): the paths of the Sun and the Earth over the whole period, drawn on the
 * same sphere as the Sun disc and the Earth globe, from the same series as the verdict.
 */
import { type Vec3, azElToVector } from './math'

/** Seconds for the dome to fade in, while the camera turns to the sky. */
export const DOME_FADE_SECONDS = 1.4
/** Seconds for the arcs to draw from the first sample to the last. */
export const ARC_DRAW_SECONDS = 2.6
/** Seconds the finished arcs stay before time playback starts. */
export const DOME_HOLD_SECONDS = 1.2
/** Seconds for the camera to go back to the overview once the day starts. */
export const CAMERA_RETURN_SECONDS = 1.8
/** When the dome sequence is over and the lunar day can start playing. */
export const DOME_TOTAL_SECONDS = DOME_FADE_SECONDS + ARC_DRAW_SECONDS + DOME_HOLD_SECONDS

/** Opacity of the dome surface at its fullest: a hint of a surface, not a wall. */
export const DOME_OPACITY = 0.07

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** 0…1 opacity factor of the dome surface `t` seconds after it started. */
export function domeFade(t: number): number {
  return easeInOut(clamp01(t / DOME_FADE_SECONDS))
}

/** How many of `n` samples of each arc are drawn `t` seconds after the dome started. */
export function arcSamplesDrawn(t: number, n: number): number {
  if (n === 0) return 0
  const k = easeInOut(clamp01((t - DOME_FADE_SECONDS) / ARC_DRAW_SECONDS))
  return Math.max(Math.round(k * n), t > DOME_FADE_SECONDS ? 1 : 0)
}

/**
 * How far the camera is turned to the sky: 0 at the overview, 1 at the sky view.
 * Turns up while the dome fades in, holds while the arcs draw, goes back as the day starts.
 */
export function skyCameraBlend(t: number): number {
  if (t <= DOME_TOTAL_SECONDS) return easeInOut(clamp01(t / DOME_FADE_SECONDS))
  return 1 - easeInOut(clamp01((t - DOME_TOTAL_SECONDS) / CAMERA_RETURN_SECONDS))
}

/** Where to look from: the Earth's mean position (its libration loop), else the Sun's. */
export function skyFocus(
  earth: { azimuth: number[]; elevation: number[] },
  sun: { azimuth: number[]; elevation: number[] },
): { az: number; el: number } {
  const body = earth.azimuth.length ? earth : sun
  let x = 0
  let y = 0
  for (const az of body.azimuth) {
    x += Math.sin((az * Math.PI) / 180)
    y += Math.cos((az * Math.PI) / 180)
  }
  const az = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
  const meanEl = body.elevation.reduce((a, b) => a + b, 0) / Math.max(body.elevation.length, 1)
  // Low bodies: aim a little above them so the terrain does not fill the frame.
  return { az, el: Math.min(Math.max(meanEl, 0), 30) + 4 }
}

/**
 * The sky view: the camera stands just behind and above the lander, looking out at `focus`
 * on the sky sphere of `radius`, so the lander is in the foreground and the arcs behind it.
 */
export function skyViewpoint(
  focus: { az: number; el: number },
  radius: number,
): { position: Vec3; target: Vec3 } {
  const [dx, , dz] = azElToVector(focus.az, 0)
  const [tx, ty, tz] = azElToVector(focus.az, focus.el)
  return {
    position: [-dx * 2.2, 0.9, -dz * 2.2],
    target: [tx * radius, ty * radius, tz * radius],
  }
}

export type Rgb = [number, number, number]

/** Arc colours: bright where the analysis sees the body, dim where terrain hides it. */
export const ARC_COLORS = {
  sun: { visible: [1, 0.78, 0.26] as Rgb, hidden: [0.42, 0.33, 0.14] as Rgb },
  earth: { visible: [0.43, 0.66, 1] as Rgb, hidden: [0.17, 0.25, 0.4] as Rgb },
}

export interface Arc {
  points: Vec3[]
  colors: Rgb[]
}

/**
 * One body's path on a sphere of `radius` around the site.
 * `visible[i]` is the analysis' verdict for sample i (terrain included), so the colour
 * changes exactly where the panorama shows the body crossing the skyline.
 */
export function arcOf(
  azimuth: number[],
  elevation: number[],
  visible: boolean[],
  radius: number,
  palette: { visible: Rgb; hidden: Rgb },
): Arc {
  const points = azimuth.map((az, i) => {
    const [x, y, z] = azElToVector(az, elevation[i])
    return [x * radius, y * radius, z * radius] as Vec3
  })
  const colors = visible.map((v) => (v ? palette.visible : palette.hidden))
  return { points, colors }
}
