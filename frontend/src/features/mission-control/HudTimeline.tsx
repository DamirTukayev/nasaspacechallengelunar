import { type PointerEvent, useMemo, useRef } from 'react'
import type { AnalyzeResponse, Window } from '../../api/types'
import { nearestIndex } from '../timeline/ticks'

const LANES = [
  { key: 'sun', label: 'Sun', className: 'lane-sun' },
  { key: 'earth', label: 'Earth', className: 'lane-earth' },
  { key: 'both', label: 'Both', className: 'lane-both' },
] as const

const LANE_H = 7
const GAP = 4
const HEIGHT = LANES.length * LANE_H + (LANES.length - 1) * GAP

interface Props {
  analysis: AnalyzeResponse
  index: number
  onSeek: (index: number) => void
  /** While the period is first played, windows are drawn only up to here (ms). */
  revealUntilMs?: number
}

/** Sun / Earth / both lanes across the whole range, with the cursor. Click or drag to seek. */
export function HudTimeline({ analysis, index, onSeek, revealUntilMs }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const timesMs = useMemo(
    () => analysis.series.times.map((t) => Date.parse(t)),
    [analysis.series.times],
  )
  const t0 = timesMs[0]
  const span = timesMs[timesMs.length - 1] - t0 || 1
  const x = (ms: number) => ((ms - t0) / span) * 1000

  function seek(event: PointerEvent<SVGSVGElement>) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    onSeek(nearestIndex(timesMs, t0 + fraction * span))
  }

  const limit = revealUntilMs ?? Infinity
  const bars = (list: Window[]) =>
    list
      .filter((w) => Date.parse(w.start) < limit)
      .map((w) => {
        const from = x(Date.parse(w.start))
        const to = x(Math.min(Date.parse(w.end), limit))
        return { key: w.start, x: from, width: Math.max(to - from, 1.5) }
      })

  return (
    <div className="hud-timeline">
      <div className="hud-timeline-labels" aria-hidden="true">
        {LANES.map((l) => (
          <span key={l.key}>{l.label}</span>
        ))}
      </div>
      <svg
        ref={ref}
        className="hud-timeline-lanes"
        viewBox={`0 0 1000 ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Sunlight, Earth visibility and both across the time range"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seek(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seek(e)
        }}
      >
        {LANES.map((lane, i) => {
          const y = i * (LANE_H + GAP)
          return (
            <g key={lane.key}>
              <rect className="hud-lane-track" x={0} y={y} width={1000} height={LANE_H} rx={0} />
              {bars(analysis.windows[lane.key]).map((b) => (
                <rect
                  key={b.key}
                  className={lane.className}
                  x={b.x}
                  y={y}
                  width={b.width}
                  height={LANE_H}
                  rx={0}
                />
              ))}
            </g>
          )
        })}
        {revealUntilMs !== undefined && (
          <rect
            className="hud-unplayed"
            x={x(revealUntilMs)}
            y={0}
            width={Math.max(1000 - x(revealUntilMs), 0)}
            height={HEIGHT}
          />
        )}
        <line
          className="hud-cursor"
          x1={x(timesMs[index])}
          x2={x(timesMs[index])}
          y1={-2}
          y2={HEIGHT + 2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
