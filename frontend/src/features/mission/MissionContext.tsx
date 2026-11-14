import { type ReactNode, useState } from 'react'
import type { Mission } from '../../api/types'
import { DEFAULT_MISSION, isMission } from './mission'
import { MissionContext } from './useMission'

const STORAGE_KEY = 'lunar-site-planner:mission'

function stored(): Mission {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isMission(value) ? value : DEFAULT_MISSION
  } catch {
    return DEFAULT_MISSION // storage blocked: just use the default
  }
}

/** The kind of mission the verdicts are judged for. A view setting: no new request needed. */
export function MissionProvider({ children }: { children: ReactNode }) {
  const [mission, setMissionState] = useState<Mission>(stored)

  function setMission(next: Mission) {
    setMissionState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not remembered across visits; nothing else depends on it.
    }
  }

  return <MissionContext value={{ mission, setMission }}>{children}</MissionContext>
}
