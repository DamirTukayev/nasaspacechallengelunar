import { useEffect, useRef, useState } from 'react'

/**
 * Advances an index through `count` samples while playing, at `samplesPerSecond`.
 * Stops at the end; playing again from the end restarts at the beginning.
 * `furthest` is the latest sample reached so far, by playing or seeking.
 */
export function usePlayback(count: number, samplesPerSecond: number) {
  const [index, setIndexState] = useState(0)
  const [furthest, setFurthest] = useState(0)
  const [playing, setPlaying] = useState(false)

  function setIndex(next: number) {
    setIndexState(next)
    setFurthest((f) => Math.max(f, next))
  }
  // Fractional position so slow speeds still move smoothly between samples.
  const position = useRef(0)

  useEffect(() => {
    if (!playing) return
    let frame = 0
    // rAF timestamps are frame start times and can be earlier than performance.now(),
    // so the clock starts at the first frame rather than at scheduling time.
    let last: number | null = null

    const tick = (now: number) => {
      const elapsed = last === null ? 0 : Math.max(now - last, 0)
      last = now
      position.current = Math.max(position.current + (elapsed / 1000) * samplesPerSecond, 0)
      if (position.current >= count - 1) {
        position.current = count - 1
        setIndex(count - 1)
        setPlaying(false)
        return
      }
      setIndex(Math.floor(position.current))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, samplesPerSecond, count])

  return {
    index,
    furthest,
    playing,
    seek(next: number) {
      const clamped = Math.min(Math.max(Math.round(next), 0), count - 1)
      position.current = clamped
      setIndex(clamped)
    },
    toggle() {
      if (!playing && index >= count - 1) {
        position.current = 0
        setIndex(0)
      }
      setPlaying(!playing)
    },
  }
}
