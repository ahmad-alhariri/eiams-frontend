import { QueryClient } from '@tanstack/react-query'

/**
 * Stale-time policy for TanStack Query.
 *
 * These values are the authoritative stale-time policy for the application.
 * Feature hooks MAY override `staleTime` per query when a shorter or longer
 * window is justified by the data's volatility, but they MUST use these
 * constants as the default reference and MUST NOT invent arbitrary values.
 *
 * Rationale (RESOLUTION-017 / D-INT-02):
 * - Operational data (balances, documents, movements, counts, custody) changes
 *   frequently enough that a short window prevents serving visibly stale data
 *   during active warehouse workflows.
 * - Master data (catalog, organization, roles, permissions) changes less often
 *   and benefits from a longer window to reduce load during reference lookups.
 * - Mutation retry is disabled because most mutations carry idempotency keys or
 *   row-version preconditions; a failed mutation is surfaced to the user rather
 *   than silently retried.
 *
 * Query key determinism (RESOLUTION-006 / FE-Q-FND-003):
 * - Every feature hook MUST use the central `queryKeys` factory so equivalent
 *   requests share keys regardless of where they are declared.
 * - Scoped keys include the active authorization scope so different contexts do
 *   not collide.
 * - Filter objects are spread as tuple elements; callers are responsible for
 *   stable filter identity within a render cycle (for example by memoizing
 *   filter objects or deriving them from stable query-param state).
 */
/** Short-lived operational data such as balances and document lists. */
export const OPERATIONAL_STALE_TIME = 30_000

/** Slowly changing catalog and organization reference data. */
export const MASTER_DATA_STALE_TIME = 5 * 60_000

/** Time before unused queries are garbage-collected. */
export const QUERY_GC_TIME = 15 * 60_000

/**
 * Creates the sole application QueryClient.
 *
 * Feature hooks may override `staleTime` with the named policy constants, but
 * MUST NOT create their own client. The client owns default retry, focus, and
 * reconnect behavior for every query in the application.
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
