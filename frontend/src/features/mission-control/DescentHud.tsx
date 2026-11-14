import { useEffect, useRef } from 'react'
import { DESCENT_TIME_SCALE, descentTelemetry } from '../scene3d/math'

/**
 * Altitude, descent rate and thrust during the landing, read from the same profile that
 * moves the lander. Updated every frame without re-rendering React.
 */
export function DescentHud() {
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLParagraphElement>(null)
  const altitudeRef = useRef<HTMLElement>(null)
  const rateRef = useRef<HTMLElement>(null)
  const thrustRef = useRef<HTMLElement>(null)
  const thrustBarRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frame = 0
    let startedAt: number | null = null
    function tick(now: number) {
      // Same clock as the 3D scene: it starts with the first drawn frame.
      startedAt ??= now
      const t = descentTelemetry((now - startedAt) / 1000)
      if (altitudeRef.current)
        altitudeRef.current.textContent = `${Math.round(t.altitudeM).toLocaleString('en-US')} m`
      if (rateRef.current) rateRef.current.textContent = `${t.descentRateMs.toFixed(1)} m/s`
      if (thrustRef.current) thrustRef.current.textContent = `${Math.round(t.thrust * 100)}%`
      if (thrustBarRef.current) thrustBarRef.current.style.width = `${t.thrust * 100}%`
      if (t.touchedDown) {
        rootRef.current?.setAttribute('data-contact', 'true')
        if (titleRef.current) titleRef.current.textContent = 'Contact · engine off'
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="mc-descent mc-panel" ref={rootRef} aria-live="off">
      <p className="mc-descent-title" ref={titleRef}>
        Powered descent
      </p>
      <dl className="mc-descent-stats">
        <div>
          <dt>Altitude</dt>
          <dd ref={altitudeRef}>4,000 m</dd>
        </div>
        <div>
          <dt>Descent rate</dt>
          <dd ref={rateRef}>—</dd>
        </div>
        <div>
          <dt>Thrust</dt>
          <dd ref={thrustRef}>—</dd>
        </div>
      </dl>
      <div className="mc-descent-thrust" aria-hidden="true">
        <span ref={thrustBarRef} />
      </div>
      <p className="mc-muted">Shown {DESCENT_TIME_SCALE}× faster than a real descent</p>
    </div>
  )
}
