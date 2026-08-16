import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import type { SiteUpsertRequest } from '@/shared/types/generated/eiams-v1'

type UpdateSiteVariables = {
  siteId: string
  request: SiteUpsertRequest
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
    mutationFn: organizationService.createSite,
    onSuccess: invalidate,
  })
}

export function useUpdateSiteMutation() {
  const invalidate = useInvalidateSites()
  return useMutation({
    mutationFn: ({ siteId, request }: UpdateSiteVariables) =>
      organizationService.updateSite(siteId, request),
    onSuccess: invalidate,
  })
}
