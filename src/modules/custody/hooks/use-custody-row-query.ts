import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { custodyService } from '@/modules/custody/services/custody.service'
import { CUSTODY_RESOURCE, custodyQueryKeys } from '@/modules/custody/hooks/use-custody-queries'
import { queryKeys } from '@/shared/services/query-keys'
import type { Custody } from '@/modules/custody/types/custody.types'
import { MAX_WIRE_PAGE_SIZE } from '@/shared/api/pagination'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'

/**
 * Single custody row fetch for the detail page (e19-t04). The contract has no
 * `GET /custodies/{id}` and no `custodyId` filter, so the row is resolved
 * client-side from the scoped list: a BOUNDED page scan over the ONE-based
 * `GET /custodies` pages, because the row can sit on ANY page of the list —
 * the scan stops at the first hit or when the server's `totalPages` is
 * exhausted. Replaced by a dedicated endpoint when the backend admits one.
 *
 * The scan is ASSET-SCOPED (PRD 12.8): the detail page renders Asset-subject
 * rows only, so a TrackedUnit / MaterialQuantity custody id is NOT resolvable
 * here and resolves to `null` (not found) rather than to another subject
 * type's row. The only link into the detail route is the Asset-scoped active
 * custody list, so the view is never widened silently.
 *
 * The key is built with the `queryKeys.scoped` factory (e24-t10 review): the
 * earlier hand-rolled `['custody','row',scope,custodyId]` key matched neither
 * `clearProtectedAuthCache` nor `clearScopedQueries` (both match the `scoped`
 * namespace only) nor `useCustodyInvalidation`, so a row fetched under one
 * user survived sign-out and a scope change.
 */
export function useCustodyRowQuery(custodyId: string | undefined) {
  const scope = useActiveScopeContext()
  return useQuery({
    queryKey:
      custodyId === undefined || scope.activeScopeCacheKey === undefined
        ? queryKeys.unscoped(CUSTODY_RESOURCE, 'row', custodyId)
        : custodyQueryKeys.row(scope.activeScopeCacheKey, custodyId),
    queryFn: async () => {
      // The wire values are built by the shared pagination helper inside the
      // service (`page` is ONE-based, `pageSize` is clamped to the backend's
      // maximum); this only walks the pages.
      let pageNumber = 1
      for (;;) {
        const page = await custodyService.listCustodies({
          page: pageNumber,
          pageSize: MAX_WIRE_PAGE_SIZE,
          subjectType: 'Asset',
        })
        const found = page.items.find((item): item is Custody => item.custodyId === custodyId)
        if (found !== undefined) {
          return found
        }
        if (pageNumber >= page.totalPages) {
          return null
        }
        pageNumber += 1
      }
    },
    enabled: scope.activeScopeCacheKey !== undefined && custodyId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}
