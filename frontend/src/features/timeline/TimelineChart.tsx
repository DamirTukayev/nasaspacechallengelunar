import { type PointerEvent, useMemo, useRef } from 'react'
import type { AnalyzeResponse, Window } from '../../api/types'
import { useElementWidth } from '../../lib/useElementWidth'
import { nearestIndex, timeTicks } from './ticks'

interface Props {
  analysis: AnalyzeResponse
  index: number
  onSeek: (index: number) => void
}

const MARGIN = { top: 10, right: 12, left: 46 }
const PLOT_H = 170
const LANE_H = 12
const LANE_GAP = 6
const AXIS_H = 24
const LANES = [
  { key: 'sun', label: 'Sun', className: 'lane-sun' },
  { key: 'earth', label: 'Earth', className: 'lane-earth' },
  { key: 'both', label: 'Both', className: 'lane-both' },
] as const

function elevationRange(sun: number[], earth: number[]) {
  const values = [...sun, ...earth]
  const max = Math.ceil(Math.max(...values)) + 1
  const min = Math.max(Math.floor(Math.min(...values)) - 1, -15)
  return { min: Math.min(min, -2), max: Math.max(max, 4) }
}

function gridValues(min: number, max: number): number[] {
  const step = [1, 2, 5, 10, 15, 30].find((s) => (max - min) / s <= 5) ?? 30
  const values: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) values.push(v)
  return values
}

export function TimelineChart({ analysis, index, onSeek }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const { series, windows } = analysis

  const timesMs = useMemo(() => series.times.map((t) => Date.parse(t)), [series.times])
  const t0 = timesMs[0]
  const t1 = timesMs[timesMs.length - 1]
  const range = useMemo(
    () => elevationRange(series.sun.elevation, series.earth.elevation),
    [series.sun.elevation, series.earth.elevation],
  )

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const lanesTop = MARGIN.top + PLOT_H + LANE_GAP
  const axisTop = lanesTop + LANES.length * (LANE_H + LANE_GAP)
  const height = axisTop + AXIS_H

  const x = (ms: number) => MARGIN.left + ((ms - t0) / (t1 - t0 || 1)) * innerW
  const y = (el: number) => MARGIN.top + ((range.max - el) / (range.max - range.min)) * PLOT_H

  const line = (values: number[]) =>
    values
      .map((v, i) => {
        const clamped = Math.max(range.min, Math.min(range.max, v))
        return `${i ? 'L' : 'M'}${x(timesMs[i]).toFixed(1)},${y(clamped).toFixed(1)}`
      })
      .join('')

  // Drop labels that would hang off the ends of the axis.
  const ticks = timeTicks(t0, t1, innerW).filter(
    (t) => x(t.ms) > MARGIN.left + 18 && x(t.ms) < MARGIN.left + innerW - 18,
  )
  const cursorX = x(timesMs[index])

  function seekFromPointer(event: PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || innerW === 0) return
    const fraction = Math.min(Math.max((event.clientX - rect.left - MARGIN.left) / innerW, 0), 1)
    onSeek(nearestIndex(timesMs, t0 + fraction * (t1 - t0)))
  }

  const bars = (list: Window[]) =>
    list.map((w) => {
      const from = x(Date.parse(w.start))
      return { key: w.start, x: from, width: Math.max(x(Date.parse(w.end)) - from, 1) }
    })

  return (
    <div ref={ref} className="timeline-canvas">
      {width > 0 && (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="timeline-svg"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            seekFromPointer(e)
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seekFromPointer(e)
          }}
        >
          {/* Sunlit periods as a soft background behind the curves. */}
          {bars(windows.sun).map((b) => (
            <rect
              key={b.key}
              className="sunlit-band"
              x={b.x}
              y={MARGIN.top}
              width={b.width}
              height={PLOT_H}
            />
          ))}

          {gridValues(range.min, range.max).map((v) => (
            <g key={v}>
              <line
                className={v === 0 ? 'tl-grid tl-grid-zero' : 'tl-grid'}
                x1={MARGIN.left}
                x2={MARGIN.left + innerW}
                y1={y(v)}
                y2={y(v)}
              />
              <text className="tl-label" x={MARGIN.left - 6} y={y(v)} dy="0.32em" textAnchor="end">
                {v}°
              </text>
            </g>
          ))}

          <path className="tl-line tl-earth" d={line(series.earth.elevation)} />
          <path className="tl-line tl-sun" d={line(series.sun.elevation)} />

          {LANES.map((lane, i) => {
            const top = lanesTop + i * (LANE_H + LANE_GAP)
            return (
              <g key={lane.key}>
                <text
                  className="tl-label"
                  x={MARGIN.left - 6}
                  y={top + LANE_H / 2}
                  dy="0.32em"
                  textAnchor="end"
                >
                  {lane.label}
                </text>
                <rect
                  className="lane-track"
                  x={MARGIN.left}
                  y={top}
                  width={innerW}
                  height={LANE_H}
                />
                {bars(windows[lane.key]).map((b) => (
                  <rect
                    key={b.key}
                    className={lane.className}
                    x={b.x}
                    y={top}
                    width={b.width}
                    height={LANE_H}
                    rx={0}
                  />
                ))}
              </g>
            )
          })}

          {ticks.map((t) => (
            <g key={t.ms}>
              <line
                className="tl-tick"
                x1={x(t.ms)}
                x2={x(t.ms)}
                y1={axisTop - 2}
                y2={axisTop + 3}
              />
              <text className="tl-label" x={x(t.ms)} y={axisTop + 16} textAnchor="middle">
                {t.label}
              </text>
            </g>
          ))}

          <line className="tl-cursor" x1={cursorX} x2={cursorX} y1={MARGIN.top} y2={axisTop} />
          <circle
            className="tl-dot tl-dot-earth"
            cx={cursorX}
            cy={y(Math.max(range.min, series.earth.elevation[index]))}
            r={4}
          />
          <circle
            className="tl-dot tl-dot-sun"
            cx={cursorX}
            cy={y(Math.max(range.min, series.sun.elevation[index]))}
            r={4.5}
          />
        </svg>
      )}
    </div>
  )
}
