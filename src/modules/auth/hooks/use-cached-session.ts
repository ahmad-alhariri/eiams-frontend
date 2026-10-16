import { useQuery } from '@tanstack/react-query'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/modules/auth/types/session.types'

/**
 * Observes the single query-backed session projection without ever triggering a
 * second hydration request.
 *
 * The application root owns hydration; every other surface is a cache observer
 * that only decides what may render once the lifecycle outcome is known. The
 * `enabled: false` plus a rejecting `queryFn` is what guarantees that: the
 * query can only ever resolve from cache, so a component that mounts after
 * hydration cannot fire a redundant `/auth/session` request.
 *
 * This lives in its own hook module rather than in `route-guards.tsx` because
 * the guards, `usePermission`, the sidebar and the document read-only banner all
 * need it, and `usePermission` is itself imported by the guards — reading the
 * session from there would make the two modules import each other. Four
 * byte-identical private copies of this function existed before it was
 * consolidated here; `src/test/design-token-literals.test.ts` fails the build if
 * another one appears.
 */
export function useCachedSession(): SessionResponse | undefined {
  const { data } = useQuery<SessionResponse>({
    queryKey: authSessionQueryKey,
    queryFn: () => Promise.reject(new Error('Session hydration is owned by the application root.')),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  return data
}
