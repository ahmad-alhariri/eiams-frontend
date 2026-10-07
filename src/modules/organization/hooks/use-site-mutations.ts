import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import type {
  SiteCreateRequest,
  SiteUpdateRequest,
} from '@/modules/organization/types/organization.types'

type UpdateSiteVariables = {
  siteId: string
  request: SiteUpdateRequest
}

function useInvalidateSites() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey === undefined) {
      return
    }

    await queryClient.invalidateQueries({
      queryKey: queryKeys.scoped(activeScopeCacheKey, 'organization', 'sites'),
      exact: false,
    })
  }
}

export function useCreateSiteMutation() {
  const invalidate = useInvalidateSites()
  return useMutation({
    mutationFn: (request: SiteCreateRequest) => organizationService.createSite(request),
    // Passed by reference rather than wrapped in `({ siteId }) => ...`: create
    // resolves with `{ id }` and update with NOTHING at all, so a handler that
    // destructures the response throws on update. The invalidation needs no
    // response value — it invalidates the whole `sites` resource key, list and
    // detail alike, because the key prefix matches both.
    onSuccess: invalidate,
  })
}

export function useUpdateSiteMutation() {
  const invalidate = useInvalidateSites()
  return useMutation({
    mutationFn: ({ siteId, request }: UpdateSiteVariables) =>
      organizationService.updateSite(siteId, request),
    // `updateSite` answers with an EMPTY body, so `data` is `undefined`. The
    // handler takes no arguments at all rather than an ignored `_data`.
    onSuccess: invalidate,
  })
}
