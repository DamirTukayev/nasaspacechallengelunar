import type { AnalyzeResponse, Mission, MissionVerdict } from '../../api/types'

export const MISSIONS: { key: Mission; label: string; caption: string; hint: string }[] = [
  {
    key: 'lunar_day',
    label: 'Day only',
    caption: 'day-only mission',
    hint: 'Works through one stretch of daylight, like the CLPS landers: needs about 10 days in a row with both Sun and Earth.',
  },
  {
    key: 'survive_night',
    label: 'Through the night',
    caption: 'through-the-night mission',
    hint: 'Has to keep going through the lunar night: judged on sunlight, Earth visibility and the longest darkness.',
  },
]

export const DEFAULT_MISSION: Mission = 'lunar_day'

export function isMission(value: unknown): value is Mission {
  return MISSIONS.some((m) => m.key === value)
}

/** The verdict for a mission, falling back to the original one from older backends. */
export function missionVerdict(
  metrics: AnalyzeResponse['metrics'],
  mission: Mission,
): MissionVerdict {
  return (
    metrics.mission_verdicts?.[mission] ?? {
      verdict: metrics.verdict,
      reasons: metrics.verdict_reasons,
    }
  )
}
