export interface SkyPoint {
  az: number
  el: number
}

/**
 * Splits a body's path across the sky into drawable pieces.
 *
 * A path that crosses north jumps from ~360° to ~0° on a flat panorama; the jump is cut at
 * the edges with an interpolated elevation. When `include` is given, only the samples where
 * it is true are kept, so the result is the "visible" part of the path.
 */
export function trackSegments(
  azimuth: number[],
  elevation: number[],
  include?: (i: number) => boolean,
): SkyPoint[][] {
  const segments: SkyPoint[][] = []
  let current: SkyPoint[] = []

  const flush = () => {
    if (current.length > 1) segments.push(current)
    current = []
  }

  for (let i = 0; i < azimuth.length; i++) {
    if (include && !include(i)) {
      flush()
      continue
    }
    const point = { az: azimuth[i], el: elevation[i] }
    const prev = current[current.length - 1]

    if (prev && Math.abs(point.az - prev.az) > 180) {
      // Crossing north: going up through 360° or down through 0°.
      const upward = prev.az > point.az
      const span = upward ? 360 - prev.az + point.az : prev.az + 360 - point.az
      const toEdge = upward ? 360 - prev.az : prev.az
      const edgeEl = prev.el + ((point.el - prev.el) * toEdge) / span
      current.push({ az: upward ? 360 : 0, el: edgeEl })
      flush()
      current.push({ az: upward ? 0 : 360, el: edgeEl })
    }
    current.push(point)
  }
  flush()
  return segments
}

export interface ElevationRange {
  min: number
  max: number
}

/**
 * Vertical range that shows the skyline and where the Sun and Earth actually travel,
 * without wasting space on deep below-horizon parts of their paths.
 */
export function elevationRange(horizon: number[], sun: number[], earth: number[]): ElevationRange {
  const skyMax = Math.max(...horizon, ...sun, ...earth)
  const skylineMin = Math.min(...horizon)
  const max = Math.ceil(Math.max(skyMax + 2, 8))
  const min = Math.floor(Math.min(skylineMin - 2, -4))
  return { min, max: Math.min(max, 90) }
}

/** Gridline step that gives roughly 4–8 lines over the range. */
export function gridStep(range: ElevationRange): number {
  const span = range.max - range.min
  return [1, 2, 5, 10, 15, 30].find((s) => span / s <= 8) ?? 30
}
