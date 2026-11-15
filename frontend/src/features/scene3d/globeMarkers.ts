import { Vector3, type Camera } from 'three'
import { MOON_RADIUS_KM } from '../mission-control/globe'

export interface GlobeMarker {
  id: string
  position: Vector3
  selected: boolean
}

/** Project surface anchors, hiding the far side and preserving the selected site in clusters. */
export function projectGlobeMarkers(
  markers: GlobeMarker[],
  camera: Camera,
  center: Vector3,
  size: { width: number; height: number },
) {
  const eye = camera.getWorldPosition(new Vector3())
  const visible: { id: string; x: number; y: number }[] = []
  if (eye.distanceTo(center) <= MOON_RADIUS_KM + 200) return visible
  const normal = new Vector3(),
    towardEye = new Vector3(),
    projected = new Vector3()
  for (const selected of [true, false]) {
    for (const marker of markers) {
      if (marker.selected !== selected) continue
      normal.copy(marker.position).sub(center)
      towardEye.copy(eye).sub(marker.position)
      if (normal.dot(towardEye) <= 0) continue
      projected.copy(marker.position).project(camera)
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1)
        continue
      const x = ((projected.x + 1) * size.width) / 2
      const y = ((1 - projected.y) * size.height) / 2
      if (visible.some((other) => Math.hypot(other.x - x, other.y - y) < 28)) continue
      visible.push({ id: marker.id, x, y })
    }
  }
  return visible
}
