import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import {
  statusCommandValue,
  type UpdateExternalPartyRequest,
} from '@/modules/organization/types/organization.types'

const ORGANIZATION_RESOURCE = 'organization'

type UpdateExternalPartyVariables = {
  externalPartyId: string
  request: UpdateExternalPartyRequest
}

/**
 * Deactivation variables.
 *
 * `expectedRowVersion` is REQUIRED, not optional polish. ExternalParty is the
 * only versioned aggregate in this module, and `PUT /external-parties/{id}/status`
 * binds `{ status, expectedRowVersion }` with both members required — the same
 * guard as the update body. There is no `POST /external-parties/{id}/deactivate`
 * route to fall back on: that path does not exist, and asking for it returns 404.
 * The page therefore has to hand over the version it read off the row it is
 * acting on.
 */
type DeactivateExternalPartyVariables = {
  externalPartyId: string
  expectedRowVersion: number
}

function useInvalidateExternalParties() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey === undefined) {
      return
    }

    await queryClient.invalidateQueries({
      // No trailing query segment: list and detail keys must both match.
      queryKey: queryKeys.scoped(activeScopeCacheKey, ORGANIZATION_RESOURCE, 'external-parties'),
      exact: false,
    })
  }
}

export function useCreateExternalPartyMutation() {
  const invalidate = useInvalidateExternalParties()
  return useMutation({
    mutationFn: organizationService.createExternalParty,
    onSuccess: invalidate,
  })
}

export function useUpdateExternalPartyMutation() {
  const invalidate = useInvalidateExternalParties()
  return useMutation({
    mutationFn: ({ externalPartyId, request }: UpdateExternalPartyVariables) =>
      organizationService.updateExternalParty(externalPartyId, request),
    onSuccess: invalidate,
  })
}

export function useDeactivateExternalPartyMutation() {
  const invalidate = useInvalidateExternalParties()
  return useMutation({
    // The single status route, addressed with the ORDINAL the command body
    // binds (`statusCommandValue('Inactive')` → 1), not the record's `status`
    // string. Reactivation is the same route with `Active` → 0; nothing else
    // about the write changes.
    mutationFn: ({ externalPartyId, expectedRowVersion }: DeactivateExternalPartyVariables) =>
      organizationService.setExternalPartyStatus(externalPartyId, {
        status: statusCommandValue.Inactive,
        expectedRowVersion,
      }),
    onSuccess: invalidate,
  })
}
