import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Link } from '../../components/ui/Link'
import { rampCss, type LandingSearch } from './landing'
import { moonTrekTiles } from './moonTrek'
import { scoreGridCells, type LandingMapLayer } from './scoreLayer'

/** Local hillshade remains available if the external imagery service cannot be reached. */
function LocalRelief({ data }: { data: LandingSearch }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const { size, heights_m, cell_m } = data.terrain
    const pixels = context.createImageData(size, size)
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        const at = (r: number, c: number) =>
          heights_m[Math.max(0, Math.min(size - 1, r)) * size + Math.max(0, Math.min(size - 1, c))]
        const dx = (at(row, col + 1) - at(row, col - 1)) / (2 * cell_m)
        const dy = (at(row - 1, col) - at(row + 1, col)) / (2 * cell_m)
        const light = (-dx * 0.5 + dy * 0.5 + 0.707) / Math.hypot(dx, dy, 1)
        const value = Math.round(40 + Math.max(0, light) * 180)
        const offset = (row * size + col) * 4
        pixels.data.set([value, value, value, 255], offset)
      }
    context.putImageData(pixels, 0, 0)
  }, [data])
  return (
    <canvas ref={canvas} width={data.terrain.size} height={data.terrain.size} aria-hidden="true" />
  )
}

export function LandingMap({
  data,
  selected,
  onSelect,
  layer,
  onLayerChange,
}: {
  data: LandingSearch
  selected: number | null
  onSelect: (index: number) => void
  layer: LandingMapLayer
  onLayerChange: (layer: LandingMapLayer) => void
}) {
  const clipId = useId()
  const half = data.terrain.half_size_km
  const tiles = useMemo(() => moonTrekTiles(half), [half])
  const [loaded, setLoaded] = useState<Record<string, boolean>>({})
  const complete = tiles.length > 0 && tiles.every((tile) => loaded[tile.url])
  const project = (value: number) => 300 + (value / half) * 300
  const ranked = data.ranking.slice(0, 5)
  const cells = useMemo(() => scoreGridCells(data), [data])
  return (
    <figure className="landing-map-figure">
      <div className="landing-map-toolbar ui-inverse">
        <span>Map layer</span>
        <div role="group" aria-label="Map layer">
          <Button
            size="compact"
            variant={layer === 'relief' ? 'primary' : 'outline'}
            aria-pressed={layer === 'relief'}
            onClick={() => onLayerChange('relief')}
          >
            Relief
          </Button>
          <Button
            size="compact"
            variant={layer === 'score' ? 'primary' : 'outline'}
            aria-pressed={layer === 'score'}
            onClick={() => onLayerChange('score')}
          >
            Overall score
          </Button>
        </div>
      </div>
      <div className="landing-map-surface">
        <LocalRelief data={data} />
        <svg
          className="landing-map-overlay"
          viewBox="0 0 600 600"
          role="img"
          aria-label={`Lunar south polar ${layer === 'score' ? 'overall score grid from 0 to 1 over relief' : 'relief'}, ${data.radius_km} km search radius. Select candidates from the adjacent list.`}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect()
            const x = (((event.clientX - bounds.left) / bounds.width) * 2 - 1) * half
            const y = (1 - ((event.clientY - bounds.top) / bounds.height) * 2) * half
            const closest = ranked.reduce<number | null>(
              (best, index) =>
                best === null ||
                Math.hypot(data.points.x_km[index] - x, data.points.y_km[index] - y) <
                  Math.hypot(data.points.x_km[best] - x, data.points.y_km[best] - y)
                  ? index
                  : best,
              null,
            )
            if (
              closest !== null &&
              Math.hypot(data.points.x_km[closest] - x, data.points.y_km[closest] - y) < half * 0.1
            )
              onSelect(closest)
          }}
        >
          <defs>
            <clipPath id={clipId}>
              <circle cx="300" cy="300" r={(data.radius_km / half) * 300} />
            </clipPath>
          </defs>
          <g opacity={complete ? 1 : 0}>
            {tiles.map((tile) => (
              <image
                key={tile.url}
                href={tile.url}
                x={project(tile.leftKm)}
                y={project(-tile.topKm)}
                width={(tile.sizeKm / half) * 300}
                height={(tile.sizeKm / half) * 300}
                onLoad={() => setLoaded((before) => ({ ...before, [tile.url]: true }))}
              />
            ))}
          </g>
          {layer === 'score' && (
            <g className="landing-score-grid" clipPath={`url(#${clipId})`}>
              {cells.map((cell) => (
                <rect
                  key={cell.index}
                  className="landing-score-cell"
                  data-point={cell.index}
                  data-score={cell.score}
                  data-eligible={cell.eligible}
                  x={project(cell.leftKm)}
                  y={project(-cell.topKm)}
                  width={(cell.sizeKm / half) * 300}
                  height={(cell.sizeKm / half) * 300}
                  fill={cell.eligible ? rampCss(cell.score) : undefined}
                >
                  <title>{`Site ${cell.index}: score ${cell.score.toFixed(3)}. ${cell.eligible ? 'Eligible' : 'Excluded by slope or sunlight limits'}.`}</title>
                </rect>
              ))}
            </g>
          )}
          <g className="landing-map-grid">
            <line x1="300" y1="0" x2="300" y2="600" />
            <line x1="0" y1="300" x2="600" y2="300" />
            <circle cx="300" cy="300" r={(data.radius_km / half) * 300} />
          </g>
          <g className="landing-map-points">
            {data.points.x_km.map((x, index) =>
              data.points.eligible[index] ? (
                <circle
                  key={index}
                  cx={project(x)}
                  cy={project(-data.points.y_km[index])}
                  r="1.8"
                />
              ) : null,
            )}
          </g>
          {ranked
            .filter((index) => index !== selected)
            .map((index) => (
              <circle
                className="landing-map-ranked"
                key={index}
                cx={project(data.points.x_km[index])}
                cy={project(-data.points.y_km[index])}
                r="5"
              />
            ))}
          {selected !== null && (
            <g className="landing-map-selected">
              <circle
                cx={project(data.points.x_km[selected])}
                cy={project(-data.points.y_km[selected])}
                r="12"
              />
              <circle
                cx={project(data.points.x_km[selected])}
                cy={project(-data.points.y_km[selected])}
                r="4"
              />
            </g>
          )}
          <g className="landing-map-scale">
            <line x1="28" y1="560" x2={28 + (20 / half) * 300} y2="560" />
            <text x="28" y="546">
              20 km
            </text>
          </g>
        </svg>
        <span className="landing-map-label">South pole · 0°E ↑ · 90°E →</span>
        <span className="landing-map-attribution">
          {complete
            ? 'LRO LOLA hillshade · NASA Moon Trek'
            : 'LOLA relief · local visual hillshade'}
        </span>
      </div>
      {layer === 'score' && (
        <div className="landing-score-legend" aria-label="Overall score legend">
          <div className="landing-score-heading">
            <strong>Overall score</strong>
            <span>0-1 · higher is better</span>
          </div>
          <div
            className="landing-score-ramp"
            role="img"
            aria-label="Score color scale from zero to one"
            style={{
              background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(rampCss).join(',')})`,
            }}
          />
          <div className="landing-score-ticks" aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
          <p>
            <span className="landing-score-excluded" aria-hidden="true" /> Grey: excluded by limits
            · {data.spacing_km} km grid, one value per cell
          </p>
        </div>
      )}
      <figcaption>
        <span>Dots: eligible sites · ring: selected candidate</span>
        <Link external href="https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon">
          Moon Trek layers
        </Link>
      </figcaption>
    </figure>
  )
}
