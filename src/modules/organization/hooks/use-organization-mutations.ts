import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import {
  statusCommandValue,
  type CreateOrganizationRequest,
  type RecordStatus,
  type UpdateOrganizationRequest,
} from '@/modules/organization/types/organization.types'

type UpdateOrganizationVariables = {
  organizationId: string
  request: UpdateOrganizationRequest
}

/**
 * Status-command variables, in the LANGUAGE OF THE RECORD.
 *
 * The caller passes the status it read off the row (`'Active'` / `'Inactive'`)
 * and this hook performs the only conversion the wire allows:
 * `statusCommandValue` maps the domain enum to the ORDINAL `PUT
 * /organizations/{id}/status` binds. The mapping lives here, at the boundary,
 * so no page has to remember that a status WRITE is an integer while a status
 * READ is a string.
 */
type SetOrganizationStatusVariables = {
  organizationId: string
  status: RecordStatus
}

function useInvalidateOrganizations() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey === undefined) {
      return
    }

    await queryClient.invalidateQueries({
      // No trailing query segment: list and detail keys must both match.
      queryKey: queryKeys.scoped(activeScopeCacheKey, 'organization', 'organizations'),
      exact: false,
    })
  }
}

export function useCreateOrganizationMutation() {
  const invalidate = useInvalidateOrganizations()
  return useMutation({
    mutationFn: (request: CreateOrganizationRequest) =>
      organizationService.createOrganization(request),
    // Passed by reference rather than wrapped in `({ organizationId }) => ...`:
    // create resolves with `{ id }` and update with NOTHING at all, so a handler
    // that destructures the response throws on update. The invalidation needs no
    // response value — it invalidates the whole `organizations` resource key,
    // list and detail alike, because the key prefix matches both.
    onSuccess: invalidate,
  })
}

export function useUpdateOrganizationMutation() {
  const invalidate = useInvalidateOrganizations()
  return useMutation({
    mutationFn: ({ organizationId, request }: UpdateOrganizationVariables) =>
      organizationService.updateOrganization(organizationId, request),
    // `updateOrganization` answers with an EMPTY body, so `data` is `undefined`.
    // The handler takes no arguments at all rather than an ignored `_data`.
    onSuccess: invalidate,
  })
}

/**
 * The single status route, addressed with the ORDINAL the command body binds
 * (`statusCommandValue('Inactive')` → 1, `statusCommandValue('Active')` → 0) and
 * never with the record's `status` string: the body is
 * `[JsonRequired] int Status`, so `{"status":"Active"}` is a JSON binding
 * failure. Reactivation is the same route with the other ordinal; nothing else
 * about the write changes.
 */
export function useSetOrganizationStatusMutation() {
  const invalidate = useInvalidateOrganizations()
  return useMutation({
    mutationFn: ({ organizationId, status }: SetOrganizationStatusVariables) =>
      organizationService.setOrganizationStatus(organizationId, {
        status: statusCommandValue[status],
      }),
    onSuccess: invalidate,
  })
}
