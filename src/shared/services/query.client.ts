import { QueryClient } from '@tanstack/react-query'

/** Short-lived operational data such as balances and document lists. */
export const OPERATIONAL_STALE_TIME = 30_000

/** Slowly changing catalog and organization reference data. */
export const MASTER_DATA_STALE_TIME = 5 * 60_000

export const QUERY_GC_TIME = 15 * 60_000

/**
 * One retry for a transient failure, none for a permanent one.
 *
 * A 4xx answer (except 408 and 429) is the server's final word: repeating the
 * request cannot change it, and it multiplied every unknown-id page load into
 * extra requests before the error state appeared.
 */
function isPermanentClientFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const response = (error as { response?: { status?: unknown } }).response
  const status =
    typeof response?.status === 'number' ? response.status : (error as { status?: unknown }).status

  return (
    typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429
  )
}

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && !isPermanentClientFailure(error)
}

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
        retry: shouldRetryQuery,
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
