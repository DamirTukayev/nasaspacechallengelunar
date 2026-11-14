import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
/** Ignore background throttling and allow shaders to warm up before measuring. */
export function FrameMeter({ onSample }: { onSample?: (fps: number) => void }) {
  const elapsed = useRef(0),
    frames = useRef(0),
    warmup = useRef(0)
  useFrame((_, delta) => {
    if (document.hidden || delta > 0.5) {
      elapsed.current = 0
      frames.current = 0
      return
    }
    warmup.current += delta
    if (warmup.current < 2) return
    elapsed.current += delta
    frames.current++
    if (elapsed.current >= 2) {
      onSample?.(frames.current / elapsed.current)
      elapsed.current = 0
      frames.current = 0
    }
  })
  return null
}
