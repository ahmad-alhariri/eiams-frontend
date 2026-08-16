import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import type { ExternalPartyUpsertRequest } from '@/shared/types/generated/eiams-v1'

const ORGANIZATION_RESOURCE = 'organization'

type UpdateExternalPartyVariables = {
  externalPartyId: string
  request: ExternalPartyUpsertRequest
}

function createIdempotencyKey(): string {
  return crypto.randomUUID()
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
    mutationFn: (externalPartyId: string) =>
      organizationService.deactivateExternalParty(externalPartyId, {
        headers: { 'Idempotency-Key': createIdempotencyKey() },
      }),
    onSuccess: invalidate,
  })
}
