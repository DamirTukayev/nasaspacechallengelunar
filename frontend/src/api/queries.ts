import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health })

export const useSites = () =>
  useQuery({ queryKey: ['sites'], queryFn: api.sites, staleTime: Infinity })
