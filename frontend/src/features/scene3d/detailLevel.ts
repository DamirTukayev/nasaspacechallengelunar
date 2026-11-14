export function detailLevel(distanceKm: number, previous: number): number {
  if (distanceKm < (previous === 1 ? 4 : 3)) return 1
  if (distanceKm < (previous > 0 ? 36 : 30)) return 4
  return 0
}
