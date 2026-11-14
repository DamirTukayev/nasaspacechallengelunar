/** Timing of the skyline sweep: rays appear around the compass, each shooting out to its hit. */

/** Seconds for the sweep to go once around the compass. */
export const SWEEP_SECONDS = 2.6
/** Seconds for one ray to grow from the lander to its skyline point. */
export const GROW_SECONDS = 0.35
/** Seconds the finished fan stays bright before it fades to a faint trace. */
export const HOLD_SECONDS = 0.6
export const FADE_SECONDS = 0.8
/** When the whole sequence is over and time playback can start. */
export const FAN_TOTAL_SECONDS = SWEEP_SECONDS + GROW_SECONDS + HOLD_SECONDS

const easeOut = (t: number) => 1 - (1 - t) ** 3

/** 0…1: how far ray `i` of `n` has grown at time `t` (s) since the sweep started. */
export function rayGrowth(t: number, i: number, n: number): number {
  const start = (i / n) * SWEEP_SECONDS
  return easeOut(Math.min(Math.max((t - start) / GROW_SECONDS, 0), 1))
}

/** Rays fully drawn at time `t`: the skyline ring is drawn through this many points. */
export function raysDone(t: number, n: number): number {
  const done = Math.floor(((t - GROW_SECONDS) / SWEEP_SECONDS) * n) + 1
  return Math.min(Math.max(done, 0), n)
}

/** Opacity of the rays: bright while sweeping, then a faint trace that stays. */
export function rayOpacity(t: number): number {
  const fadeStart = FAN_TOTAL_SECONDS
  if (t <= fadeStart) return 0.55
  const k = Math.min((t - fadeStart) / FADE_SECONDS, 1)
  return 0.55 + (0.08 - 0.55) * k
}
