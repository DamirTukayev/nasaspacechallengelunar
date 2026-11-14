import { useEffect, useRef, useState, type RefObject, type ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { Vector3 } from 'three'
import type { Vec3 } from './math'
import { prefersReducedMotion } from '../mission-control/flyIn'

export interface ComparisonView {
  positions: [Vec3, Vec3]
  selected: 'A' | 'B'
  onSelect: (id: 'A' | 'B') => void
}
export function ComparisonMarkers({
  view,
  controlsRef,
}: {
  view: ComparisonView
  controlsRef: RefObject<ComponentRef<typeof OrbitControls> | null>
}) {
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
  }, [x, y, z])
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
  return (
    <>
      {view.positions.map((position, i) => {
        const id = i === 0 ? 'A' : 'B'
        return (
          <group key={id} position={position}>
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 1, 8]} />
              <meshBasicMaterial color={i === 0 ? '#f5c542' : '#65cfff'} />
            </mesh>
            <Html position={[0, 1.2, 0]} center>
              <button
                className="mc-compare-marker"
                aria-label={`Focus ${id}`}
                aria-pressed={view.selected === id}
                onClick={() => view.onSelect(id)}
              >
                {id} · {i === 0 ? 'Original' : 'Better'}
              </button>
            </Html>
          </group>
        )
      })}
    </>
  )
}
