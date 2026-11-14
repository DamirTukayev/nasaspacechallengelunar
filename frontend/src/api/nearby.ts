import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { NearbyRequest } from './types'

/** Runs only when `enabled`: the first map for a site takes several seconds of server CPU. */
export const useNearby = (request: NearbyRequest, enabled: boolean) =>
  useQuery({
    queryKey: ['nearby', request],
    queryFn: () => api.nearby(request),
    enabled,
    staleTime: Infinity,
    retry: false,
  })
