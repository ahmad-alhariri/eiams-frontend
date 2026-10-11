import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import {
  statusCommandValue,
  type OrganizationalUnitCreateRequest,
  type OrganizationalUnitUpdateRequest,
  type RecordStatus,
} from '@/modules/organization/types/organization.types'

type UpdateOrganizationalUnitVariables = {
  orgUnitId: string
  request: OrganizationalUnitUpdateRequest
}

/**
 * Status-command variables, in the LANGUAGE OF THE RECORD.
 *
 * The caller passes the status it read off the row (`'Active'` / `'Inactive'`)
 * and this hook performs the only conversion the wire allows:
 * `statusCommandValue` maps the domain enum to the ORDINAL `PUT
 * /organizational-units/{id}/status` binds. The mapping lives here, at the
 * boundary, so no page has to remember that a status WRITE is an integer while a
 * status READ is a string — and no page writes a bare `0`/`1` that reads as a
 * falsy guard.
 */
type SetOrganizationalUnitStatusVariables = {
  orgUnitId: string
  status: RecordStatus
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
    // `undefined`. The handler takes no arguments at all rather than an ignored
    // `_data`.
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
 *
 * There is no delete route in this module. Deactivation is the only removal
 * mechanism an organizational unit has, which is why one command serves both
 * directions.
 */
export function useSetOrganizationalUnitStatusMutation() {
  const invalidate = useInvalidateOrganizationalUnits()
  return useMutation({
    mutationFn: ({ orgUnitId, status }: SetOrganizationalUnitStatusVariables) =>
      organizationService.setOrganizationalUnitStatus(orgUnitId, {
        status: statusCommandValue[status],
      }),
    onSuccess: invalidate,
  })
}
