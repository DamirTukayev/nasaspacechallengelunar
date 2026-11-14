import { useEffect, useRef, type RefObject } from 'react'
import { formatUtc } from '../../lib/time'

/** HUD only: the globe and the terrain now share one persistent Canvas. */
export default function GlobeIntro({
  name,
  time,
  altitudeRef,
  onArrive,
}: {
  name: string
  time: string
  altitudeRef: RefObject<HTMLElement | null>
  onArrive: () => void
}) {
  const arrive = useRef(onArrive)
  useEffect(() => {
    arrive.current = onArrive
  })
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if ([' ', 'Enter', 'Escape', 's', 'S'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        arrive.current()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])
  return (
    <div className="mc-flight-overlay">
      <div className="mc-intro-readout mc-panel" aria-live="off">
        <p className="mc-intro-kicker">Approach · {name}</p>
        <dl>
          <div>
            <dt>Altitude</dt>
            <dd ref={altitudeRef}>—</dd>
          </div>
        </dl>
        <p className="mc-muted">
          Sunlight as at {formatUtc(time)} (JPL Horizons) · LRO colour map, NASA SVS
        </p>
      </div>
      <button
        type="button"
        className="secondary mc-intro-skip"
        onClick={onArrive}
        title="Skip flight (Space, Enter or Esc)"
      >
        Skip ▸▸
      </button>
    </div>
  )
}
