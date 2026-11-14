import { useId } from 'react'
import type { AnalyzeResponse } from '../../api/types'
import { formatUtc } from '../../lib/time'
import { TimelineChart } from './TimelineChart'

const SPEEDS = [
  { label: '½ day/s', days: 0.5 },
  { label: '1 day/s', days: 1 },
  { label: '3 days/s', days: 3 },
  { label: '1 week/s', days: 7 },
] as const

interface Props {
  analysis: AnalyzeResponse
  index: number
  playing: boolean
  speedDays: number
  onSeek: (index: number) => void
  onTogglePlay: () => void
  onSpeedChange: (days: number) => void
}

export function Timeline({
  analysis,
  index,
  playing,
  speedDays,
  onSeek,
  onTogglePlay,
  onSpeedChange,
}: Props) {
  const sliderId = useId()
  const speedId = useId()
  const last = analysis.series.times.length - 1

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-legend">
        <span className="legend-item legend-sun">Sun elevation</span>
        <span className="legend-item legend-earth">Earth elevation</span>
        <span className="legend-item legend-sunlit">Sunlit</span>
        <span className="legend-item legend-both">Sun + Earth</span>
      </div>

      <TimelineChart analysis={analysis} index={index} onSeek={onSeek} />

      <div className="timeline-controls">
        <button
          type="button"
          className="play-button"
          aria-pressed={playing}
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={onTogglePlay}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={last}
          value={index}
          aria-label="Time"
          aria-valuetext={formatUtc(analysis.series.times[index])}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        <output htmlFor={sliderId} className="timeline-time">
          {formatUtc(analysis.series.times[index])}
        </output>
        <label htmlFor={speedId} className="visually-hidden">
          Playback speed
        </label>
        <select
          id={speedId}
          className="speed-select"
          value={speedDays}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s.days} value={s.days}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
