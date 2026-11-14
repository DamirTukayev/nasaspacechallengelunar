import { type RefObject, type ComponentRef } from 'react'
import { Html, OrbitControls } from '@react-three/drei'
import type { Vec3 } from './math'
import { useComparisonCamera } from './useComparisonCamera'

export interface ComparisonView {
  positions: [Vec3, Vec3]
  selected: 'A' | 'B'
  focusId: number
  onSelect: (id: 'A' | 'B') => void
}
export function ComparisonMarkers({
  view,
  controlsRef,
}: {
  view: ComparisonView
  controlsRef: RefObject<ComponentRef<typeof OrbitControls> | null>
}) {
  useComparisonCamera(view, controlsRef)
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
