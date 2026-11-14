import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { CalendarRequest } from './types'

/**
 * Runs only when `enabled`: the first calendar for a site asks JPL Horizons for months of
 * positions. While another mission length or span loads, the previous calendar stays on screen.
 */
export const useCalendar = (request: CalendarRequest, enabled: boolean) =>
  useQuery({
    queryKey: ['calendar', request],
    queryFn: () => api.calendar(request),
    enabled,
    staleTime: Infinity,
    retry: false,
    placeholderData: keepPreviousData,
  })
