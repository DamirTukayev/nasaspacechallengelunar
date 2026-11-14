import { useQuery } from '@tanstack/react-query'
import { api } from './client'
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

export const useHorizon = (site: { lat: number; lon: number } | null) =>
  useQuery({
    queryKey: ['horizon', site?.lat, site?.lon],
    queryFn: () => api.horizon(site!.lat, site!.lon),
    enabled: site !== null,
    staleTime: Infinity,
    retry: false,
  })

export const useTerrain = (site: { lat: number; lon: number }) =>
  useQuery({
    queryKey: ['terrain', site.lat, site.lon],
    queryFn: () => api.terrain(site.lat, site.lon),
    staleTime: Infinity,
    retry: false,
  })

/** Results for the same request are reused: comparing scenarios never refetches. */
export const useAnalysis = (request: ScenarioRequest | null) =>
  useQuery({
    queryKey: ['analyze', request],
    queryFn: () => api.analyze(request!),
    enabled: request !== null,
    staleTime: Infinity,
    retry: false,
  })
