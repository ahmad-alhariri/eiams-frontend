import { QueryClient } from '@tanstack/react-query'

/** Short-lived operational data such as balances and document lists. */
export const OPERATIONAL_STALE_TIME = 30_000

/** Slowly changing catalog and organization reference data. */
export const MASTER_DATA_STALE_TIME = 5 * 60_000

export const QUERY_GC_TIME = 15 * 60_000

/**
 * Creates the sole application QueryClient. Feature hooks may override
 * staleTime with the named policy constants, but must not create a client.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: OPERATIONAL_STALE_TIME,
        gcTime: QUERY_GC_TIME,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export const queryClient = createQueryClient()
