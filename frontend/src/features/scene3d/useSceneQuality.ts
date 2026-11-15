import { useCallback, useRef, useState } from 'react'
import {
  advanceQuality,
  deviceQuality,
  type AutoQualityState,
  type Quality,
  type QualityChoice,
} from './quality'

export function useSceneQuality(initial: () => Quality = deviceQuality) {
  const [choice, setChoiceState] = useState<QualityChoice>('auto')
  const [automatic, setAutomatic] = useState(initial)
  const controller = useRef<AutoQualityState>({ quality: automatic, slow: 0 })
  const choiceRef = useRef<QualityChoice>('auto')
  const [fps, setFps] = useState<number | null>(null)
  const setChoice = useCallback((next: QualityChoice) => {
    // A manual override cancels the experiment, including any remembered cap.
    const restored = controller.current.probe?.original ?? controller.current.quality
    controller.current = { quality: restored, slow: 0, settle: true }
    choiceRef.current = next
    setAutomatic(restored)
    setChoiceState(next)
  }, [])
  const sample = useCallback((value: number, variation: number) => {
    setFps(Math.round(value))
    if (choiceRef.current !== 'auto') return
    controller.current = advanceQuality(controller.current, value, variation)
    setAutomatic(controller.current.quality)
  }, [])
  return { choice, setChoice, quality: choice === 'auto' ? automatic : choice, fps, sample }
}
