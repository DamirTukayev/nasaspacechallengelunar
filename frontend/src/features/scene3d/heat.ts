/**
 * The sunlight map on the 3D terrain (W6): for every grid node around the site, the share of
 * the time played so far with the Sun (or the Earth) above that node's own skyline. The nodes
 * are the /api/nearby grid, so the numbers are those of the nearby-spots map.
 */
import type { NearbyResponse } from '../../api/types'

export type HeatLayer = 'sun' | 'earth'

/** The grid for the map: the whole ±20 km 3D patch, 21 × 21 nodes (as warm_cache precomputes). */
export const SUNLIGHT_MAP_HALF_EXTENT_KM = 20
export const SUNLIGHT_MAP_STEP_KM = 2

/** base64 of bits packed big-endian → one 0/1 per sample. */
export function decodeBits(base64: string, samples: number): Uint8Array {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const out = new Uint8Array(samples)
  for (let i = 0; i < samples; i++) out[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1
  return out
}

/**
 * Running counts per node: counts[node * (samples + 1) + k] = visible samples among the
 * first k. Answers "share so far" for any moment in O(1). null nodes stay all zero.
 */
export function runningCounts(timelines: (string | null)[], samples: number): Uint16Array {
  const stride = samples + 1
  const counts = new Uint16Array(timelines.length * stride)
  timelines.forEach((bits, node) => {
    if (bits === null) return
    const values = decodeBits(bits, samples)
    let sum = 0
    for (let k = 0; k < samples; k++) {
      sum += values[k]
      counts[node * stride + k + 1] = sum
    }
  })
  return counts
}

/**
 * Share (0…1) of samples 0…index with the body visible, per node; NaN off the DEM.
 */
export function sharesUntil(
  counts: Uint16Array,
  nodes: number,
  samples: number,
  index: number,
  present: boolean[],
): Float32Array {
  const stride = samples + 1
  const k = Math.min(Math.max(index + 1, 1), samples)
  const out = new Float32Array(nodes)
  for (let node = 0; node < nodes; node++) {
    out[node] = present[node] ? counts[node * stride + k] / k : Number.NaN
  }
  return out
}

/**
 * For every terrain vertex (row-major, `size` per side over ±halfExtentM, row 0 = north),
 * the four surrounding grid nodes and their bilinear weights. Vertices outside the grid get
 * node −1: they keep the plain terrain colour.
 */
export function vertexWeights(
  size: number,
  halfExtentM: number,
  grid: Pick<NearbyResponse, 'east_m' | 'north_m'>,
): { nodes: Int32Array; weights: Float32Array } {
  const n = grid.east_m.length
  const step = grid.east_m[1] - grid.east_m[0]
  const west = grid.east_m[0]
  const north = grid.north_m[0]
  const nodes = new Int32Array(size * size * 4).fill(-1)
  const weights = new Float32Array(size * size * 4)

  for (let row = 0; row < size; row++) {
    const y = halfExtentM - (row / (size - 1)) * 2 * halfExtentM
    const fr = (north - y) / step
    for (let col = 0; col < size; col++) {
      const x = -halfExtentM + (col / (size - 1)) * 2 * halfExtentM
      const fc = (x - west) / step
      if (fr < 0 || fc < 0 || fr > n - 1 || fc > n - 1) continue
      const r0 = Math.min(Math.floor(fr), n - 2)
      const c0 = Math.min(Math.floor(fc), n - 2)
      const dr = fr - r0
      const dc = fc - c0
      const v = (row * size + col) * 4
      nodes.set([r0 * n + c0, r0 * n + c0 + 1, (r0 + 1) * n + c0, (r0 + 1) * n + c0 + 1], v)
      weights.set([(1 - dr) * (1 - dc), (1 - dr) * dc, dr * (1 - dc), dr * dc], v)
    }
  }
  return { nodes, weights }
}

/** Blend the node values at a vertex; NaN (no data) where all its nodes are off the DEM. */
export function vertexValue(
  values: Float32Array,
  nodes: Int32Array,
  weights: Float32Array,
  vertex: number,
): number {
  let sum = 0
  let total = 0
  for (let j = 0; j < 4; j++) {
    const node = nodes[vertex * 4 + j]
    if (node < 0) return Number.NaN
    const value = values[node]
    if (Number.isNaN(value)) continue
    sum += value * weights[vertex * 4 + j]
    total += weights[vertex * 4 + j]
  }
  return total > 0 ? sum / total : Number.NaN
}

export type Rgb = [number, number, number]

/**
 * Sequential, one hue per layer, dark → light with the value: the Sun's amber and the Earth's
 * blue, as everywhere else in the app. 0 stays near the terrain's own grey-blue shadow.
 */
const RAMPS: Record<HeatLayer, [Rgb, Rgb]> = {
  sun: [
    [0.16, 0.18, 0.24],
    [1.0, 0.78, 0.26],
  ],
  earth: [
    [0.16, 0.18, 0.24],
    [0.43, 0.66, 1.0],
  ],
}

export function rampColor(layer: HeatLayer, value: number): Rgb {
  const [low, high] = RAMPS[layer]
  const t = Math.min(Math.max(value, 0), 1)
  return [
    low[0] + (high[0] - low[0]) * t,
    low[1] + (high[1] - low[1]) * t,
    low[2] + (high[2] - low[2]) * t,
  ]
}
