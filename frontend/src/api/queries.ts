import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { USE_MOCKS, api } from './client'
import type { ScenarioRequest } from './types'

/** While the backend is down, keep checking so the app recovers on its own. */
export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: (query) => (query.state.status === 'error' ? 5000 : false),
  })

export const useSites = () =>
  useQuery({ queryKey: ['sites'], queryFn: api.sites, staleTime: Infinity })

export const horizonQuery = (site: { lat: number; lon: number }) =>
  queryOptions({
    queryKey: ['horizon', site.lat, site.lon],
    queryFn: () => api.horizon(site.lat, site.lon),
    staleTime: Infinity,
    retry: false,
  })

export const useHorizon = (site: { lat: number; lon: number } | null) =>
  useQuery({
    ...horizonQuery(site ?? { lat: 0, lon: 0 }),
    enabled: site !== null,
  })

export const useTerrain = (site: { lat: number; lon: number }) =>
  useQuery({
    queryKey: ['terrain', site.lat, site.lon],
    queryFn: () => api.terrain(site.lat, site.lon),
    staleTime: Infinity,
    retry: false,
  })

/** Results for the same request are reused: comparing scenarios never refetches. */
export const analysisQuery = (request: ScenarioRequest) =>
  queryOptions({
    queryKey: ['analyze', request],
    queryFn: () => api.analyze(request),
    staleTime: Infinity,
    retry: false,
  })

export const useAnalysis = (request: ScenarioRequest | null) =>
  useQuery({
    ...analysisQuery(request ?? ({} as ScenarioRequest)),
    enabled: request !== null,
  })

/**
 * Loads analyses (and their skylines) in the background, so opening them later is instant.
 * A failed prefetch holds no data, so opening that result simply fetches it again.
 */
export function usePrefetchAnalyses(scenarios: { request: ScenarioRequest }[]) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (USE_MOCKS) return
    for (const { request } of scenarios) {
      void queryClient.prefetchQuery(analysisQuery(request))
      void queryClient.prefetchQuery(horizonQuery(request))
    }
  }, [scenarios, queryClient])
}
