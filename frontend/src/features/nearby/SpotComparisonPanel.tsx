import type { SpotComparison } from './spotComparison'

export function SpotComparisonPanel({
  comparison,
  selected,
  onSelect,
  onClose,
}: {
  comparison: SpotComparison
  selected: 'A' | 'B'
  onSelect: (id: 'A' | 'B') => void
  onClose: () => void
}) {
  const { here, best, hours, gainedHours, shorterNightHours, distanceKm } = comparison
  return (
    <section className="mc-compare-panel" aria-label="Nearby site comparison">
      <header>
        <strong>Better nearby · {distanceKm.toFixed(1)} km</strong>
        <button onClick={onClose}>Close comparison</button>
      </header>
      <p>
        <strong>+{gainedHours.toFixed(1)} h of sunlight + Earth contact</strong>
      </p>
      <p>
        {Math.abs(shorterNightHours).toFixed(1)} h {shorterNightHours >= 0 ? 'shorter' : 'longer'}{' '}
        longest night
      </p>
      <div className="mc-compare-picks">
        {(['A', 'B'] as const).map((id) => {
          const spot = (id === 'A' ? here : best).spot!
          return (
            <button key={id} aria-pressed={selected === id} onClick={() => onSelect(id)}>
              <strong>
                {id} · {id === 'A' ? 'Original site' : 'Better nearby'}
              </strong>
              <span>{((spot.both_pct * hours) / 100).toFixed(1)} h light + link</span>
              <span>{spot.longest_dark_hours.toFixed(1)} h longest night</span>
            </button>
          )
        })}
      </div>
      <p className="mc-muted">
        Whole period · {hours.toFixed(1)} h. Best sampled point on a 2 km grid within ±20 km for
        total light + link; grid estimate, not a continuous safe landing window.
      </p>
    </section>
  )
}
