import type { NearbyResponse, TerrainResponse } from '../../api/types'
export type TerrainMetric = 'sunlit_pct' | 'earth_visible_pct'
export interface TerrainMap {
  data: NearbyResponse
  metric: TerrainMetric
  values?: Float32Array
  selected: number
}

/** Bilinear interpolation inside a complete cell; missing DEM nodes stay uncoloured. */
export function mapValue(
  map: NearbyResponse,
  metric: TerrainMetric,
  eastM: number,
  northM: number,
  values?: Float32Array,
): number | null {
  const width = map.east_m.length,
    height = map.north_m.length
  const col = (eastM - map.east_m[0]) / (map.east_m[1] - map.east_m[0])
  const row = (map.north_m[0] - northM) / (map.north_m[0] - map.north_m[1])
  if (col < 0 || row < 0 || col > width - 1 || row > height - 1) return null
  const c0 = Math.min(Math.floor(col), width - 2),
    r0 = Math.min(Math.floor(row), height - 2)
  let value = 0
  for (const [dr, dc] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ]) {
    const weight = (1 - Math.abs(row - r0 - dr)) * (1 - Math.abs(col - c0 - dc))
    if (weight < 1e-9) continue
    const spot = map.spots[(r0 + dr) * width + c0 + dc]
    if (!spot) return null
    const node = (r0 + dr) * width + c0 + dc
    const sample = values ? values[node] * 100 : spot[metric]
    if (!Number.isFinite(sample)) return null
    value += weight * sample
  }
  return value
}

export function terrainHeight(terrain: TerrainResponse, eastM: number, northM: number): number {
  const { size, half_extent_m: half, heights } = terrain
  const col = Math.min(size - 1, Math.max(0, ((eastM + half) / (2 * half)) * (size - 1)))
  const row = Math.min(size - 1, Math.max(0, ((half - northM) / (2 * half)) * (size - 1)))
  const c = Math.min(size - 2, Math.floor(col)),
    r = Math.min(size - 2, Math.floor(row))
  let value = 0
  for (const [dr, dc] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ])
    value +=
      heights[(r + dr) * size + c + dc] *
      (1 - Math.abs(row - r - dr)) *
      (1 - Math.abs(col - c - dc))
  return value / 1000
}
