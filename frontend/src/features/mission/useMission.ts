import { createContext, useContext } from 'react'
import type { Mission } from '../../api/types'
import { DEFAULT_MISSION } from './mission'

export const MissionContext = createContext<{
  mission: Mission
  setMission: (m: Mission) => void
}>({
  mission: DEFAULT_MISSION,
  setMission: () => {},
})

/** The kind of mission the verdicts are judged for. */
export function useMission() {
  return useContext(MissionContext)
}
