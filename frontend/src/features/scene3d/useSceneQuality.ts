import { useCallback, useRef, useState } from 'react'
import { deviceQuality, lowerQuality, type QualityChoice } from './quality'

export function useSceneQuality() {
  const [choice, setChoice] = useState<QualityChoice>('auto')
  const [automatic, setAutomatic] = useState(deviceQuality)
  const [fps, setFps] = useState<number | null>(null)
  const slow = useRef(0)
  const quality = choice === 'auto' ? automatic : choice
  const sample = useCallback(
    (value: number) => {
      setFps(Math.round(value))
      if (choice !== 'auto') return
      slow.current = value < 50 ? slow.current + 1 : 0
      if (slow.current >= 2) {
        setAutomatic((q) => lowerQuality(q, value))
        slow.current = 0
      }
    },
    [choice],
  )
  return { choice, setChoice, quality, fps, sample }
}
