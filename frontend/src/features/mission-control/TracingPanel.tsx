import { useEffect, useRef, useState } from 'react'
import type { HorizonResponse } from '../../api/types'
import { raysDone } from '../scene3d/fan'

/** How long the finished numbers stay on screen. */
const LINGER_MS = 2800

interface Props {
  horizon: HorizonResponse
  onHidden: () => void
}

const fmt = (n: number) => n.toLocaleString('en-US')

/** Live numbers for the skyline sweep. All totals come from the API response. */
export function TracingPanel({ horizon, onHidden }: Props) {
  // Mounted on touchdown, in the same frame the 3D sweep starts.
  const [startedAt] = useState(() => performance.now())
  const [now, setNow] = useState(startedAt)
  const n = horizon.azimuths.length
  const t = (now - startedAt) / 1000
  const rays = raysDone(t, n)
  const done = rays >= n

  // The parent re-renders every frame during playback: keep the latest callback without
  // restarting the timer each time.
  const onHiddenRef = useRef(onHidden)
  useEffect(() => {
    onHiddenRef.current = onHidden
  })

  // Tick while sweeping; stop once every ray is done.
  useEffect(() => {
    if (done) return
    let frame = 0
    const tick = () => {
      setNow(performance.now())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [done])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => onHiddenRef.current(), LINGER_MS)
    return () => clearTimeout(timer)
  }, [done])

  const samples = Math.round(((horizon.terrain_samples ?? 0) * rays) / n)
  const distances = (horizon.hits?.distance_m ?? []).filter((d): d is number => d !== null)
  const farthestKm = distances.length ? Math.max(...distances) / 1000 : 0

  return (
    <div className="mc-tracing mc-panel" role="status" data-done={done}>
      <p className="mc-tracing-title">{done ? 'Skyline traced' : 'Tracing the skyline…'}</p>
      <dl className="mc-tracing-stats">
        <div>
          <dt>Rays</dt>
          <dd>
            {fmt(rays)}
            <span className="mc-muted"> / {fmt(n)}</span>
          </dd>
        </div>
        <div>
          <dt>LOLA terrain points</dt>
          <dd>{fmt(samples)}</dd>
        </div>
        <div>
          <dt>Farthest skyline point</dt>
          <dd>{done ? `${farthestKm.toFixed(0)} km` : '…'}</dd>
        </div>
      </dl>
    </div>
  )
}
