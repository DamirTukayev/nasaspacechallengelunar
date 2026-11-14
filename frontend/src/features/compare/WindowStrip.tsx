import type { AnalyzeResponse, Window } from '../../api/types'

const LANES = [
  { key: 'sun', className: 'lane-sun' },
  { key: 'earth', className: 'lane-earth' },
  { key: 'both', className: 'lane-both' },
] as const

const LANE_H = 6
const GAP = 3

/** Tiny Sun / Earth / both lanes over the scenario's own time range. */
export function WindowStrip({ analysis }: { analysis: AnalyzeResponse }) {
  const { times } = analysis.series
  const t0 = Date.parse(times[0])
  const span = Date.parse(times[times.length - 1]) - t0 || 1
  const height = LANES.length * LANE_H + (LANES.length - 1) * GAP

  const bar = (w: Window) => {
    const x = ((Date.parse(w.start) - t0) / span) * 100
    const width = Math.max(((Date.parse(w.end) - Date.parse(w.start)) / span) * 100, 0.3)
    return { x, width }
  }

  return (
    <svg
      className="window-strip"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Sunlight, Earth visibility and both, across the time range"
    >
      {LANES.map((lane, i) => {
        const y = i * (LANE_H + GAP)
        return (
          <g key={lane.key}>
            <rect className="lane-track" x={0} y={y} width={100} height={LANE_H} />
            {analysis.windows[lane.key].map((w) => {
              const { x, width } = bar(w)
              return (
                <rect
                  key={w.start}
                  className={lane.className}
                  x={x}
                  y={y}
                  width={width}
                  height={LANE_H}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
