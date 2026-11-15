import type { LandingSearch } from './landing'

export type LandingMapLayer = 'relief' | 'score'

/** Constant-value grid footprints. Do not interpolate scores or normalize to this result's max. */
export function scoreGridCells(data: LandingSearch) {
  const sizeKm = data.spacing_km
  if (!Number.isFinite(sizeKm) || sizeKm <= 0) return []
  return data.points.total.flatMap((score, index) => {
    const x = data.points.x_km[index]
    const y = data.points.y_km[index]
    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return []
    return [
      {
        index,
        score,
        eligible: data.points.eligible[index] === true,
        leftKm: x - sizeKm / 2,
        topKm: y + sizeKm / 2,
        sizeKm,
      },
    ]
  })
}
