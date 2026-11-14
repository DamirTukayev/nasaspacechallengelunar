import { Hint } from '../metrics/MetricCards'
import { useMission } from './useMission'
import { MISSIONS } from './mission'

/** Picks which verdict the results show. Changes the colours at once, without re-analysing. */
export function MissionSwitch() {
  const { mission, setMission } = useMission()
  const current = MISSIONS.find((m) => m.key === mission)!

  return (
    <div className="field">
      <span className="field-label" id="mission-label">
        Mission <Hint text={current.hint} />
      </span>
      <div className="segmented" role="group" aria-labelledby="mission-label">
        {MISSIONS.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={mission === m.key}
            title={m.hint}
            onClick={() => setMission(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
