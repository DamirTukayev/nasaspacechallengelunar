import { useState } from 'react'
import { useNearby } from '../../api/nearby'
import type { NearbyResponse } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { formatDuration } from '../../lib/time'
import type { Scenario } from '../scenario/scenario'
import {
  type GridCell,
  type NearbyMetric,
  NEARBY_METRICS,
  cells,
  centerIndex,
  colorFor,
  describeOffset,
  summarize,
} from './nearby'

const CELL = 28
const GAP = 2
const LEGEND_STOPS = [0, 25, 50, 75, 100]

interface Props {
  scenario: Scenario
  /** Open a grid node as its own scenario. */
  onOpenSpot: (lat: number, lon: number) => void
}

function Grid({
  map,
  metric,
  onOpenSpot,
}: {
  map: NearbyResponse
  metric: NearbyMetric
  onOpenSpot: Props['onOpenSpot']
}) {
  const [hover, setHover] = useState<GridCell | null>(null)
  const n = map.east_m.length
  const size = n * CELL
  const center = centerIndex(map)
  const metricLabel = NEARBY_METRICS.find((m) => m.key === metric)!.label
  const extentKm = Math.round(Math.abs(map.east_m[0]) / 100) / 10

  return (
    <div className="nearby-grid-wrap">
      <span className="nearby-compass nearby-compass-n">N</span>
      <svg
        className="nearby-grid"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${metricLabel} on a ${n} by ${n} grid of spots around the site, north up`}
        onMouseLeave={() => setHover(null)}
      >
        {cells(map).map((c) => {
          const x = c.col * CELL + GAP / 2
          const y = c.row * CELL + GAP / 2
          const w = CELL - GAP
          if (!c.spot) {
            return (
              <rect
                key={c.index}
                x={x}
                y={y}
                width={w}
                height={w}
                rx={0}
                className="nearby-cell-empty"
                onMouseEnter={() => setHover(c)}
              />
            )
          }
          const { lat, lon } = c.spot
          return (
            <rect
              key={c.index}
              x={x}
              y={y}
              width={w}
              height={w}
              rx={0}
              fill={colorFor(c.spot[metric])}
              className="nearby-cell"
              tabIndex={0}
              role="button"
              aria-label={`${describeOffset(c.eastM, c.northM)}: ${metricLabel} ${c.spot[metric].toFixed(0)}%. Open this spot.`}
              onMouseEnter={() => setHover(c)}
              onFocus={() => setHover(c)}
              onClick={() => onOpenSpot(lat, lon)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenSpot(lat, lon)
                }
              }}
            />
          )
        })}
        {/* The site itself: a ring around the centre cell. */}
        <rect
          x={(center % n) * CELL + GAP / 2 - 1}
          y={Math.floor(center / n) * CELL + GAP / 2 - 1}
          width={CELL - GAP + 2}
          height={CELL - GAP + 2}
          rx={0}
          className="nearby-here"
          pointerEvents="none"
        />
        {map.best_index !== null && metric === 'both_pct' && map.best_index !== center && (
          <text
            x={(map.best_index % n) * CELL + CELL / 2}
            y={Math.floor(map.best_index / n) * CELL + CELL / 2}
            className="nearby-best"
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
          >
            ★
          </text>
        )}
        {hover && (
          <rect
            x={hover.col * CELL}
            y={hover.row * CELL}
            width={CELL}
            height={CELL}
            rx={0}
            className="nearby-hover"
            pointerEvents="none"
          />
        )}
      </svg>
      <span className="nearby-compass nearby-compass-axis">
        <span>{extentKm} km W</span>
        <span>{extentKm} km E</span>
      </span>

      <div className="nearby-tooltip" aria-live="polite">
        {hover ? (
          hover.spot ? (
            <>
              <strong>{describeOffset(hover.eastM, hover.northM)}</strong>
              <span>
                {hover.spot.lat.toFixed(3)}°, {hover.spot.lon.toFixed(3)}° · ground{' '}
                {hover.spot.site_alt_m.toFixed(0)} m
              </span>
              <span>
                Sun + Earth {hover.spot.both_pct.toFixed(0)}% · Sunlight{' '}
                {hover.spot.sunlit_pct.toFixed(0)}% · Earth{' '}
                {hover.spot.earth_visible_pct.toFixed(0)}%
              </span>
              <span>Longest darkness {formatDuration(hover.spot.longest_dark_hours)}</span>
              <span className="muted">Click to open this spot</span>
            </>
          ) : (
            <span className="muted">Outside the terrain model</span>
          )
        ) : (
          <span className="muted">Point at a square to see the numbers</span>
        )}
      </div>
    </div>
  )
}

function Legend({ label }: { label: string }) {
  const gradient = `linear-gradient(to right, ${LEGEND_STOPS.map(colorFor).join(', ')})`
  return (
    <div className="nearby-legend">
      <span className="small muted">{label}</span>
      <div className="nearby-legend-bar" style={{ background: gradient }} aria-hidden="true" />
      <div className="nearby-legend-ticks small muted">
        {LEGEND_STOPS.map((s) => (
          <span key={s}>{s}%</span>
        ))}
      </div>
      <span className="small muted nearby-legend-keys">
        <span className="nearby-key-here" aria-hidden="true" /> the site
        <span className="nearby-key-best" aria-hidden="true">
          ★
        </span>{' '}
        most Sun + Earth
      </span>
    </div>
  )
}

function Summary({
  map,
  metric,
  onOpenSpot,
}: { map: NearbyResponse } & Omit<Props, 'scenario'> & { metric: NearbyMetric }) {
  const { here, best } = summarize(map, metric)
  const label = NEARBY_METRICS.find((m) => m.key === metric)!.label
  if (!best?.spot || !here.spot) return null
  const gain = best.spot[metric] - here.spot[metric]

  if (gain < 1) {
    return (
      <p className="nearby-summary">
        Nowhere in this square does better than the site itself: {label}{' '}
        {here.spot[metric].toFixed(0)}%.
      </p>
    )
  }
  return (
    <p className="nearby-summary">
      <strong>{describeOffset(best.eastM, best.northM)}</strong> of the site: {label}{' '}
      <strong>{best.spot[metric].toFixed(0)}%</strong> instead of {here.spot[metric].toFixed(0)}%.{' '}
      <button
        type="button"
        className="link-button"
        onClick={() => onOpenSpot(best.spot!.lat, best.spot!.lon)}
      >
        Open that spot
      </button>
    </p>
  )
}

/** "Would a few kilometres make a difference?" — a heatmap of the square around the site. */
export function NearbyMap({ scenario, onOpenSpot }: Props) {
  const [requested, setRequested] = useState(false)
  const [metric, setMetric] = useState<NearbyMetric>('both_pct')
  const nearby = useNearby(scenario.request, requested)
  const label = NEARBY_METRICS.find((m) => m.key === metric)!.label

  return (
    <section className="nearby" aria-labelledby="nearby-title">
      <h3 id="nearby-title" className="section-title">
        Better spots nearby?
      </h3>
      <p className="muted small">
        A few kilometres can move a lander from a crater shadow onto a sunlit ridge. The map
        computes the real skyline for every square of a 10 × 10 km grid around the site, on the same
        dates.
      </p>

      {!requested && (
        <button type="button" className="secondary" onClick={() => setRequested(true)}>
          Show the map
        </button>
      )}

      {requested && nearby.isPending && (
        <Spinner label="Computing the skyline of 121 spots… about 10 seconds the first time" />
      )}

      {nearby.isError && (
        <div className="error-card" role="alert">
          <p>
            <strong>Could not build the map.</strong> {nearby.error.message}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => nearby.refetch()}
            disabled={nearby.isFetching}
          >
            {nearby.isFetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {nearby.data && (
        <>
          <div className="segmented" role="group" aria-label="Map shows">
            {NEARBY_METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={metric === m.key}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Summary map={nearby.data} metric={metric} onOpenSpot={onOpenSpot} />
          <div className="nearby-body">
            <Grid map={nearby.data} metric={metric} onOpenSpot={onOpenSpot} />
            <Legend label={`${label}, share of the time`} />
          </div>
          <p className="muted small">
            Skylines at {nearby.data.azimuth_step_deg}° resolution (single-site analysis uses 0.5°),
            so the centre square can differ from the numbers above by a percent or so.
          </p>
        </>
      )}
    </section>
  )
}
