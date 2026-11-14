import { formatUtc } from '../../lib/time'
import type { Scenario } from './scenario'

export const MAX_COMPARED = 4

interface Props {
  scenarios: Scenario[]
  activeKey: string | null
  onSelect: (scenario: Scenario) => void
  onRemove: (key: string) => void
}

/** Scenarios saved for comparison. The side-by-side view comes in F6. */
export function ComparisonList({ scenarios, activeKey, onSelect, onRemove }: Props) {
  if (scenarios.length === 0) return null

  return (
    <section className="panel comparison">
      <h2>
        Compare ({scenarios.length}/{MAX_COMPARED})
      </h2>
      <ul className="comparison-list">
        {scenarios.map((s) => (
          <li key={s.key} className="comparison-item" data-active={s.key === activeKey}>
            <button type="button" className="comparison-open" onClick={() => onSelect(s)}>
              <span className="comparison-name">{s.name}</span>
              <span className="muted small">
                {formatUtc(s.request.start).slice(0, 10)} → {formatUtc(s.request.end).slice(0, 10)}
              </span>
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${s.name} from comparison`}
              onClick={() => onRemove(s.key)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
