import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import {
  statusCommandValue,
  type RecordStatus,
  type UpdateExternalPartyRequest,
} from '@/modules/organization/types/organization.types'

const ORGANIZATION_RESOURCE = 'organization'

type UpdateExternalPartyVariables = {
  externalPartyId: string
  request: UpdateExternalPartyRequest
}

/**
 * Status-command variables, in the LANGUAGE OF THE RECORD — plus the version
 * guard.
 *
 * `expectedRowVersion` is REQUIRED, not optional polish. ExternalParty is the
 * only versioned aggregate in this module, and `PUT /external-parties/{id}/status`
 * binds `{ status, expectedRowVersion }` with both members required — the same
 * guard as the update body. There is no `POST /external-parties/{id}/deactivate`
 * route to fall back on: that path does not exist, and asking for it returns 404.
 * The page therefore has to hand over the version it read off the row it is
 * acting on, and because a successful status write BUMPED that version, the
 * invalidation below is what makes the next attempt carry a fresh one.
 */
type SetExternalPartyStatusVariables = {
  externalPartyId: string
  expectedRowVersion: number
  status: RecordStatus
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

/**
 * The single status route, addressed with the ORDINAL the command body binds
 * (`statusCommandValue('Inactive')` → 1, `statusCommandValue('Active')` → 0),
 * not the record's `status` string. Reactivation is the same route with the
 * other ordinal; nothing else about the write changes.
 *
 * There is no delete route: deactivation is the only removal mechanism an
 * external party has, which is why one command serves both directions.
 */
export function useSetExternalPartyStatusMutation() {
  const invalidate = useInvalidateExternalParties()
  return useMutation({
    mutationFn: ({
      externalPartyId,
      expectedRowVersion,
      status,
    }: SetExternalPartyStatusVariables) =>
      organizationService.setExternalPartyStatus(externalPartyId, {
        status: statusCommandValue[status],
        expectedRowVersion,
      }),
    onSuccess: invalidate,
  })
}
