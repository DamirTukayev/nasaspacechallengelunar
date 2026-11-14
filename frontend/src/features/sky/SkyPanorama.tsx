import { useId, useMemo } from 'react'
import type { AnalyzeResponse, HorizonResponse } from '../../api/types'
import { useElementWidth } from '../../lib/useElementWidth'
import { type SkyPoint, elevationRange, gridStep, trackSegments } from './geometry'

type Series = AnalyzeResponse['series']

interface Props {
  horizon: HorizonResponse
  series: Series
  /** Index into series.times of the moment to show. */
  index: number
}

const HEIGHT = 300
const MARGIN = { top: 14, right: 12, bottom: 28, left: 40 }
const COMPASS = [
  { az: 0, label: 'N' },
  { az: 45, label: 'NE' },
  { az: 90, label: 'E' },
  { az: 135, label: 'SE' },
  { az: 180, label: 'S' },
  { az: 225, label: 'SW' },
  { az: 270, label: 'W' },
  { az: 315, label: 'NW' },
  { az: 360, label: 'N' },
]

export function SkyPanorama({ horizon, series, index }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const clipId = useId()

  const range = useMemo(
    () => elevationRange(horizon.elevations, series.sun.elevation, series.earth.elevation),
    [horizon.elevations, series.sun.elevation, series.earth.elevation],
  )

  const tracks = useMemo(() => {
    const { sun, earth } = series
    return {
      sunAll: trackSegments(sun.azimuth, sun.elevation),
      sunLit: trackSegments(sun.azimuth, sun.elevation, (i) => sun.visible_fraction[i] > 0),
      earthAll: trackSegments(earth.azimuth, earth.elevation),
      earthUp: trackSegments(earth.azimuth, earth.elevation, (i) => earth.visible[i]),
    }
  }, [series])

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (az: number) => MARGIN.left + (az / 360) * innerW
  const y = (el: number) => MARGIN.top + ((range.max - el) / (range.max - range.min)) * innerH
  const path = (points: SkyPoint[]) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.az).toFixed(1)},${y(p.el).toFixed(1)}`).join('')

  const skyline = useMemo(() => {
    const { azimuths, elevations } = horizon
    // Close the silhouette at 360° with the 0° value so it wraps seamlessly.
    return [...azimuths.map((az, i) => ({ az, el: elevations[i] })), { az: 360, el: elevations[0] }]
  }, [horizon])

  const step = gridStep(range)
  const gridLines: number[] = []
  for (let el = Math.ceil(range.min / step) * step; el <= range.max; el += step) gridLines.push(el)

  const sun = {
    az: series.sun.azimuth[index],
    el: series.sun.elevation[index],
    visible: series.sun.visible_fraction[index] > 0,
  }
  const earth = {
    az: series.earth.azimuth[index],
    el: series.earth.elevation[index],
    visible: series.earth.visible[index],
  }

  // Vertical stretch relative to a true-proportion view, worth saying out loud.
  const exaggeration = innerW > 0 ? innerH / (range.max - range.min) / (innerW / 360) : 1

  return (
    <figure className="sky">
      <div ref={ref} className="sky-canvas">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Sky panorama: Sun at azimuth ${sun.az.toFixed(0)}°, elevation ${sun.el.toFixed(1)}°; Earth at azimuth ${earth.az.toFixed(0)}°, elevation ${earth.el.toFixed(1)}°`}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={MARGIN.left} y={MARGIN.top} width={innerW} height={innerH} />
              </clipPath>
            </defs>

            {gridLines.map((el) => (
              <g key={el}>
                <line
                  className={el === 0 ? 'sky-grid sky-grid-zero' : 'sky-grid'}
                  x1={MARGIN.left}
                  x2={MARGIN.left + innerW}
                  y1={y(el)}
                  y2={y(el)}
                />
                <text className="sky-tick" x={MARGIN.left - 6} y={y(el)} dy="0.32em">
                  {el}°
                </text>
              </g>
            ))}
            {COMPASS.map(({ az, label }) => (
              <g key={az}>
                <line
                  className="sky-grid"
                  x1={x(az)}
                  x2={x(az)}
                  y1={MARGIN.top}
                  y2={MARGIN.top + innerH}
                />
                <text
                  className="sky-compass"
                  x={x(az)}
                  y={HEIGHT - 8}
                  textAnchor={az === 0 ? 'start' : az === 360 ? 'end' : 'middle'}
                >
                  {label}
                </text>
              </g>
            ))}

            <g clipPath={`url(#${clipId})`}>
              {/* Full paths, faint: where the bodies would be without terrain. */}
              {tracks.sunAll.map((seg, i) => (
                <path key={`sa${i}`} className="track track-sun track-hidden" d={path(seg)} />
              ))}
              {tracks.earthAll.map((seg, i) => (
                <path key={`ea${i}`} className="track track-earth track-hidden" d={path(seg)} />
              ))}

              <path
                className="terrain"
                d={`${path(skyline)}L${x(360)},${y(range.min)}L${x(0)},${y(range.min)}Z`}
              />

              {tracks.sunLit.map((seg, i) => (
                <path key={`sl${i}`} className="track track-sun" d={path(seg)} />
              ))}
              {tracks.earthUp.map((seg, i) => (
                <path key={`eu${i}`} className="track track-earth" d={path(seg)} />
              ))}

              <g className="marker marker-earth" data-visible={earth.visible}>
                <circle cx={x(earth.az)} cy={y(earth.el)} r={7} />
                <title>
                  Earth: az {earth.az.toFixed(1)}°, el {earth.el.toFixed(2)}°
                  {earth.visible ? '' : ' (hidden)'}
                </title>
              </g>
              <g className="marker marker-sun" data-visible={sun.visible}>
                <circle cx={x(sun.az)} cy={y(sun.el)} r={8} />
                <title>
                  Sun: az {sun.az.toFixed(1)}°, el {sun.el.toFixed(2)}°
                  {sun.visible ? '' : ' (hidden)'}
                </title>
              </g>
            </g>
          </svg>
        )}
      </div>
      <figcaption className="sky-legend">
        <span className="legend-item legend-sun">
          Sun {sun.el.toFixed(1)}° · az {sun.az.toFixed(0)}°{sun.visible ? '' : ' · hidden'}
        </span>
        <span className="legend-item legend-earth">
          Earth {earth.el.toFixed(1)}° · az {earth.az.toFixed(0)}°{earth.visible ? '' : ' · hidden'}
        </span>
        <span className="legend-item legend-terrain">
          {horizon.kind === 'terrain' ? 'Skyline (LOLA terrain)' : 'Flat horizon (no terrain)'}
        </span>
        {exaggeration > 1.5 && (
          <span className="muted small">Vertical scale ×{exaggeration.toFixed(0)}</span>
        )}
      </figcaption>
    </figure>
  )
}
