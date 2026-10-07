import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import type {
  OrganizationalUnitCreateRequest,
  OrganizationalUnitUpdateRequest,
} from '@/modules/organization/types/organization.types'

type UpdateOrganizationalUnitVariables = {
  orgUnitId: string
  request: OrganizationalUnitUpdateRequest
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
    mutationFn: (request: OrganizationalUnitCreateRequest) =>
      organizationService.createOrganizationalUnit(request),
    // Passed by reference rather than wrapped in `({ orgUnitId }) => ...`:
    // create resolves with `{ id }` and update with NOTHING at all, so a handler
    // that destructures the response throws on update. The invalidation needs no
    // response value — it invalidates the whole `organizational-units` resource
    // key, list and detail alike, because the key prefix matches both.
    onSuccess: invalidate,
  })
}

export function useUpdateOrganizationalUnitMutation() {
  const invalidate = useInvalidateOrganizationalUnits()
  return useMutation({
    mutationFn: ({ orgUnitId, request }: UpdateOrganizationalUnitVariables) =>
      organizationService.updateOrganizationalUnit(orgUnitId, request),
    // `updateOrganizationalUnit` answers with an EMPTY body, so `data` is
    // `undefined`. The handler takes no arguments at all rather than an
    // ignored `_data`.
    onSuccess: invalidate,
  })
}
