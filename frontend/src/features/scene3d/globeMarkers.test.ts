import { expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { MOON_RADIUS_KM as radius } from '../mission-control/globe'
import { projectGlobeMarkers } from './globeMarkers'

const center = new Vector3(0, -radius - 1.3, 0)
const size = { width: 1440, height: 1000 }
function cameraAt(distance = radius * 3) {
  const camera = new PerspectiveCamera(50, size.width / size.height, 0.1, radius * 10)
  camera.position.copy(center).add(new Vector3(0, 0, distance))
  camera.lookAt(center)
  return camera
}
function marker(id: string, x: number, z: number, selected = false) {
  return { id, position: center.clone().add(new Vector3(x, 0, z)), selected }
}

it('projects the near-side site and hides a site behind the Moon', () => {
  const projected = projectGlobeMarkers(
    [marker('front', 0, radius), marker('back', 0, -radius)],
    cameraAt(),
    center,
    size,
  )
  expect(projected).toEqual([{ id: 'front', x: 720, y: 500 }])
})

it('keeps the selected site instead of overlapping neighbours, regardless of catalog order', () => {
  const projected = projectGlobeMarkers(
    [
      marker('neighbour', 5, Math.sqrt(radius ** 2 - 25)),
      marker('selected', 0, radius, true),
      marker('separate', 600, Math.sqrt(radius ** 2 - 600 ** 2)),
    ],
    cameraAt(),
    center,
    size,
  )
  expect(projected.map((p) => p.id)).toEqual(['selected', 'separate'])
})

it('hides overview markers within 200 km of the surface', () => {
  expect(
    projectGlobeMarkers(
      [marker('selected', 0, radius, true)],
      cameraAt(radius + 199),
      center,
      size,
    ),
  ).toEqual([])
})

it('hides anchors behind the camera even when their hemisphere faces it', () => {
  const camera = cameraAt()
  camera.lookAt(center.clone().add(new Vector3(0, 0, radius * 4)))
  expect(projectGlobeMarkers([marker('front', 0, radius)], camera, center, size)).toEqual([])
})

it('updates positions for the resized viewport without moving the lunar anchor', () => {
  const point = marker('front', 0, radius)
  expect(projectGlobeMarkers([point], cameraAt(), center, { width: 800, height: 600 })).toEqual([
    { id: 'front', x: 400, y: 300 },
  ])
  expect(point.position).toEqual(center.clone().add(new Vector3(0, 0, radius)))
})
