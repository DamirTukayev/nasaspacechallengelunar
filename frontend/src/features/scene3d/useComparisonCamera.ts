import { useEffect, useRef, useState, type RefObject, type ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { OrbitControls } from '@react-three/drei'
import { Vector3 } from 'three'
import { prefersReducedMotion } from '../mission-control/flyIn'
import type { ComparisonView } from './ComparisonMarkers'

export function useComparisonFocus() {
  const [focus, setFocus] = useState({ selected: 'A' as 'A' | 'B', focusId: 0 })
  return {
    ...focus,
    select: (selected: 'A' | 'B') =>
      setFocus((previous) => ({ selected, focusId: previous.focusId + 1 })),
  }
}

export function useComparisonCamera(
  view: ComparisonView,
  controlsRef: RefObject<Pick<ComponentRef<typeof OrbitControls>, 'target' | 'update'> | null>,
) {
  const camera = useThree((s) => s.camera)
  const moving = useRef(true)
  const [reduced] = useState(prefersReducedMotion)
  useEffect(() => {
    const controls = controlsRef.current
    const position = camera.position.clone()
    const target = controls?.target.clone()
    return () => {
      camera.position.copy(position)
      if (controls && target) {
        controls.target.copy(target)
        controls.update()
      }
    }
  }, [camera, controlsRef])
  const point = view.positions[view.selected === 'A' ? 0 : 1]
  const [x, y, z] = point
  useEffect(() => {
    moving.current = true
  }, [x, y, z, view.focusId])
  useFrame((_, dt) => {
    const controls = controlsRef.current
    if (!moving.current || !controls) return
    const target = new Vector3(x, y, z)
    const destination = target.clone().add(new Vector3(10, 8, 14))
    const alpha = reduced ? 1 : 1 - Math.exp(-5 * dt)
    camera.position.lerp(destination, alpha)
    controls.target.lerp(target, alpha)
    controls.update()
    if (camera.position.distanceTo(destination) < 0.02) moving.current = false
  })
}
