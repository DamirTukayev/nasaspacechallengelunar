import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
/** Ignore background throttling and allow shaders to warm up before measuring. */
export function FrameMeter({ onSample }: { onSample?: (fps: number, variation: number) => void }) {
  const elapsed = useRef(0),
    frames = useRef(0),
    warmup = useRef(0),
    squares = useRef(0)
  useFrame((_, delta) => {
    if (!onSample || document.hidden || delta > 0.5) {
      warmup.current = 0
      elapsed.current = 0
      frames.current = 0
      squares.current = 0
      return
    }
    warmup.current += delta
    if (warmup.current < 2) return
    elapsed.current += delta
    frames.current++
    squares.current += delta * delta
    if (elapsed.current >= 2) {
      const mean = elapsed.current / frames.current
      const variation =
        Math.sqrt(Math.max(0, squares.current / frames.current - mean * mean)) / mean
      onSample?.(frames.current / elapsed.current, variation)
      squares.current = 0
      elapsed.current = 0
      frames.current = 0
    }
  })
  return null
}
