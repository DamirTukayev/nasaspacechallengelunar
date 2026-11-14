// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PerspectiveCamera, Vector3 } from 'three'
import { expect, it, vi } from 'vitest'
import { useComparisonCamera, useComparisonFocus } from './useComparisonCamera'

const runtime = vi.hoisted(() => ({
  frame: (_state: unknown, _dt: number) => {},
  camera: null as unknown,
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: typeof runtime.frame) => {
    runtime.frame = callback
  },
  useThree: (select: (state: { camera: unknown }) => unknown) => select({ camera: runtime.camera }),
}))
vi.mock('../mission-control/flyIn', () => ({ prefersReducedMotion: () => false }))

it('refocuses the same point after manual orbit, then restores the original view on exit', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const camera = new PerspectiveCamera()
  camera.position.set(15, 8, 20)
  runtime.camera = camera
  const controls = { target: new Vector3(), update: vi.fn() }
  const controlsRef = { current: controls } as Parameters<typeof useComparisonCamera>[1]
  let select: (id: 'A' | 'B') => void = () => {}
  function Harness() {
    const focus = useComparisonFocus()
    select = focus.select
    useComparisonCamera(
      {
        positions: [
          [0, 0, 0],
          [4, 1, 6],
        ],
        selected: focus.selected,
        focusId: focus.focusId,
        onSelect: focus.select,
      },
      controlsRef,
    )
    return null
  }
  const host = document.createElement('div'),
    root = createRoot(host)
  let mounted = true
  try {
    act(() => root.render(<Harness />))
    act(() => select('B'))
    const tick = () =>
      act(() => {
        for (let i = 0; i < 180; i++) runtime.frame({}, 1 / 60)
      })
    tick()
    expect(camera.position.distanceTo(new Vector3(14, 9, 20))).toBeLessThan(0.02)
    camera.position.set(80, 40, 50)
    controls.target.set(30, 0, 20)
    tick()
    expect(camera.position.x).toBe(80)
    act(() => select('B'))
    tick()
    expect(camera.position.distanceTo(new Vector3(14, 9, 20))).toBeLessThan(0.02)
    expect(controls.target.distanceTo(new Vector3(4, 1, 6))).toBeLessThan(0.02)
    act(() => select('A'))
    tick()
    expect(camera.position.distanceTo(new Vector3(10, 8, 14))).toBeLessThan(0.02)
    act(() => root.unmount())
    mounted = false
    expect(camera.position.toArray()).toEqual([15, 8, 20])
    expect(controls.target.toArray()).toEqual([0, 0, 0])
  } finally {
    if (mounted) act(() => root.unmount())
    vi.unstubAllGlobals()
  }
})
