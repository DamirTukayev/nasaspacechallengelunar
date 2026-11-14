import { useEffect, useState } from 'react'
import type { AnalyzeResponse } from '../../api/types'
import { MISSIONS, missionVerdict } from '../mission/mission'
import { useMission } from '../mission/useMission'

const VERDICT_LABEL = { green: 'Viable', yellow: 'Marginal', red: 'Not viable' } as const

/** How long the big verdict stays in the middle of the screen. */
const REVEAL_MS = 4500

/** The moment the period ends: the verdict, large, then it settles into the side panel. */
export function VerdictReveal({
  analysis,
  visible,
}: {
  analysis: AnalyzeResponse
  visible: boolean
}) {
  const { mission } = useMission()
  const verdict = missionVerdict(analysis.metrics, mission)
  const caption = MISSIONS.find((m) => m.key === mission)!.caption
  const [shown, setShown] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShown(false), REVEAL_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!shown || !visible) return null
  return (
    <div className="mc-reveal mc-panel" role="status" data-verdict={verdict.verdict}>
      <span className="mc-reveal-kicker">Verdict for a {caption}</span>
      <strong className="mc-reveal-label">{VERDICT_LABEL[verdict.verdict]}</strong>
      <span className="mc-reveal-reason">{verdict.reasons[0]}</span>
    </div>
  )
}
