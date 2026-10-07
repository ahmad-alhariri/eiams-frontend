import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { custodyService } from '@/modules/custody/services/custody.service'
import { CUSTODY_RESOURCE, custodyQueryKeys } from '@/modules/custody/hooks/use-custody-queries'
import { queryKeys } from '@/shared/services/query-keys'
import type { AssetCustody } from '@/shared/types/generated/eiams-v1'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'

/**
 * Single custody row fetch for the detail page (e19-t04). The contract has no
 * `GET /custodies/{id}`, so this reuses the scoped list with a page-size of
 * one and resolves client-side — acceptable at registry scale and replaced by
 * a dedicated endpoint when the backend admits one.
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
        ? queryKeys.public(CUSTODY_RESOURCE, 'row')
        : custodyQueryKeys.row(scope.activeScopeCacheKey, custodyId),
    queryFn: async () => {
      const page = await custodyService.listCustodies({
        pageIndex: 0,
        pageSize: 100,
        status: 'Active',
      })
      // The custody detail page renders Asset-subject rows only (PRD 12.8);
      // Material/TrackedUnit rows are excluded from this view.
      const found = page.items.find(
        (item): item is AssetCustody & { subjectType: 'Asset' } =>
          item.custodyId === custodyId && 'assetNumber' in item,
      )
      return found ?? null
    },
    enabled: scope.activeScopeCacheKey !== undefined && custodyId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}
