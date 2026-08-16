import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import type { OrganizationalUnitUpsertRequest } from '@/shared/types/generated/eiams-v1'

type UpdateOrganizationalUnitVariables = {
  orgUnitId: string
  request: OrganizationalUnitUpsertRequest
}

function useInvalidateOrganizationalUnits() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey === undefined) {
      return
    }

    await queryClient.invalidateQueries({
      queryKey: queryKeys.scoped(activeScopeCacheKey, 'organization', 'organizational-units'),
      exact: false,
    })
  }
}

export function useCreateOrganizationalUnitMutation() {
  const invalidate = useInvalidateOrganizationalUnits()
  return useMutation({
    mutationFn: organizationService.createOrganizationalUnit,
    onSuccess: invalidate,
  })
}

export function useUpdateOrganizationalUnitMutation() {
  const invalidate = useInvalidateOrganizationalUnits()
  return useMutation({
    mutationFn: ({ orgUnitId, request }: UpdateOrganizationalUnitVariables) =>
      organizationService.updateOrganizationalUnit(orgUnitId, request),
    onSuccess: invalidate,
  })
}
