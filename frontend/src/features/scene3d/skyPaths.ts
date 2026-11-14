import type { AzElTrack } from '../../api/types'
import { azElToVector, type Vec3 } from './math'

export const DOME_RADIUS = 12

export function skyPoint(az: number, el: number, radius = DOME_RADIUS): Vec3 {
  return azElToVector(az, el).map((v) => v * radius) as Vec3
}

/** Keep the last sample and preserve the original coordinates; never invent a closed orbit. */
export function trackIndices(length: number, maxPoints = 2048): number[] {
  if (length === 0) return []
  const stride = Math.max(1, Math.ceil((length - 1) / (maxPoints - 1)))
  const indices = Array.from({ length: Math.ceil((length - 1) / stride) }, (_, i) => i * stride)
  return [...indices, length - 1]
}

/** Split at the geometric horizon, including paths that cross the 0°/360° azimuth seam. */
export function skySegments(track: AzElTrack, maxPoints = 2048) {
  const indices = trackIndices(track.azimuth.length, maxPoints)
  const above: number[] = []
  const below: number[] = []
  for (let i = 1; i < indices.length; i++) {
    const a = indices[i - 1],
      b = indices[i]
    const p = skyPoint(track.azimuth[a], track.elevation[a])
    const q = skyPoint(track.azimuth[b], track.elevation[b])
    const upA = track.elevation[a] >= 0,
      upB = track.elevation[b] >= 0
    if (upA === upB) (upA ? above : below).push(...p, ...q)
    else {
      const t = -p[1] / (q[1] - p[1])
      const x = p[0] + t * (q[0] - p[0]),
        z = p[2] + t * (q[2] - p[2])
      const scale = DOME_RADIUS / Math.hypot(x, z)
      const crossing = [x * scale, 0, z * scale]
      ;(upA ? above : below).push(...p, ...crossing)
      ;(upB ? above : below).push(...crossing, ...q)
    }
  }
  return { above: new Float32Array(above), below: new Float32Array(below), count: indices.length }
}
