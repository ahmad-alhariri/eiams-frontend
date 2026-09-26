import { useCallback } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import type { ListSitesQuery, Site } from '@/modules/organization/types/organization.api-types'
import { useSiteSelector } from '@/shared/selectors/adapters/site-selector'
import type { EntitySelectorResult } from '@/shared/selectors/selector-adapter'

export interface ScopedSiteSelectorResult extends EntitySelectorResult<Site> {
  /** False until the session has a selected active scope; callers disable the control. */
  scopeReady: boolean
}

const DEFAULT_MAX_RESULTS = 10

/**
 * Production binding of the shared site selector adapter to the active
 * session scope.
 *
 * The loader searches the contract-backed site list (server-side search)
 * while the shared adapter keeps mapping, deduplication, and the inactive
 * option state consistent with every other selector consumer. Until a scope
 * is selected the loader resolves to an empty list and `scopeReady` stays
 * false, so a form never offers sites outside the active scope.
 *
 * NOTE: no import from `@/shared/types/generated/eiams-v1` (D-INT-02 guard);
 * the handwritten `Site` is structurally compatible with the shared
 * adapter's entity shape (`siteId`, `nameAr`, `status`).
 */
export function useScopedSiteSelector(maxResults = DEFAULT_MAX_RESULTS): ScopedSiteSelectorResult {
  const { activeScopeCacheKey } = useActiveScopeContext()
  const scopeReady = activeScopeCacheKey !== undefined

  const loadSites = useCallback(
    async (query: string) => {
      if (!scopeReady) {
        return []
      }
      const listQuery: ListSitesQuery = {
        page: 0,
        pageSize: Math.max(1, maxResults),
        ...(query.trim() === '' ? {} : { search: query.trim() }),
      }
      const page = await organizationService.listSites(listQuery)
      return [...page.items]
    },
    [maxResults, scopeReady],
  )

  const selector = useSiteSelector(loadSites)
  return { ...selector, scopeReady }
}
