import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { ScenarioRequest } from './types'

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health })

export const useSites = () =>
  useQuery({ queryKey: ['sites'], queryFn: api.sites, staleTime: Infinity })

/** Results for the same request are reused: comparing scenarios never refetches. */
export const useAnalysis = (request: ScenarioRequest | null) =>
  useQuery({
    queryKey: ['analyze', request],
    queryFn: () => api.analyze(request!),
    enabled: request !== null,
    staleTime: Infinity,
    retry: false,
  })
