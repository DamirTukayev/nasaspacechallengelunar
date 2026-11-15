// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSceneQuality } from './useSceneQuality'
import { FrameMeter } from './FrameMeter'

const runtime = vi.hoisted(() => ({ frame: (_state: unknown, _delta: number) => {} }))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: typeof runtime.frame) => {
    runtime.frame = callback
  },
}))
let root: Root
let host: HTMLDivElement
let quality: ReturnType<typeof useSceneQuality>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  host = document.createElement('div')
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
function Controller() {
  const current = useSceneQuality(() => 'balanced')
  useEffect(() => {
    quality = current
  }, [current])
  return null
}

it('retains a manual profile when measurements restart for another scene', () => {
  act(() => root.render(<Controller />))
  act(() => quality.setChoice('high'))
  act(() => quality.sample(12, 0.3))
  act(() => quality.resetSampling())
  expect(quality.choice).toBe('high')
  expect(quality.quality).toBe('high')
  expect(quality.fps).toBeNull()
  act(() => {
    for (let i = 0; i < 6; i++) quality.sample(12, 0.3)
  })
  expect(quality.quality).toBe('high')
})

it('retains a learned reduction while discarding an unfinished previous-scene probe', () => {
  act(() => root.render(<Controller />))
  act(() => {
    quality.sample(35, 0.03)
    quality.sample(35, 0.03)
  })
  expect(quality.quality).toBe('low')
  act(() => quality.resetSampling())
  act(() => {
    quality.sample(60, 0.03)
    quality.sample(60, 0.03)
    quality.sample(60, 0.03)
  })
  expect(quality.choice).toBe('auto')
  expect(quality.quality).toBe('low')
})

it('does not carry a single slow window across a scene boundary', () => {
  act(() => root.render(<Controller />))
  act(() => quality.sample(20, 0.3))
  act(() => quality.resetSampling())
  act(() => {
    quality.sample(20, 0.3)
    quality.sample(20, 0.3)
  })
  expect(quality.quality).toBe('balanced')
  act(() => quality.sample(20, 0.3))
  expect(quality.quality).toBe('low')
})

it('ignores loading frames and requires a new warmup after sampling is paused', () => {
  const sample = vi.fn()
  const tick = (frames: number) =>
    act(() => {
      for (let i = 0; i < frames; i++) runtime.frame({}, 0.125)
    })
  act(() => root.render(<FrameMeter />))
  tick(48)
  expect(sample).not.toHaveBeenCalled()
  act(() => root.render(<FrameMeter onSample={sample} />))
  tick(16)
  expect(sample).not.toHaveBeenCalled()
  tick(16)
  expect(sample).toHaveBeenCalledTimes(1)
  act(() => root.render(<FrameMeter />))
  tick(8)
  act(() => root.render(<FrameMeter onSample={sample} />))
  tick(16)
  expect(sample).toHaveBeenCalledTimes(1)
  tick(16)
  expect(sample).toHaveBeenCalledTimes(2)
})
