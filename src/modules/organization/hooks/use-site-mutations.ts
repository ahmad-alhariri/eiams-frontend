import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import {
  statusCommandValue,
  type RecordStatus,
  type SiteCreateRequest,
  type SiteUpdateRequest,
} from '@/modules/organization/types/organization.types'

type UpdateSiteVariables = {
  siteId: string
  request: SiteUpdateRequest
}

/**
 * Status-command variables, in the LANGUAGE OF THE RECORD.
 *
 * The caller passes the status it read off the row (`'Active'` / `'Inactive'`)
 * and this hook performs the only conversion the wire allows:
 * `statusCommandValue` maps the domain enum to the ORDINAL `PUT
 * /sites/{id}/status` binds. The mapping lives here, at the boundary, so no page
 * has to remember that a status WRITE is an integer while a status READ is a
 * string — and no page writes a bare `0`/`1` that reads as a falsy guard.
 */
type SetSiteStatusVariables = {
  siteId: string
  status: RecordStatus
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

/**
 * The single status route, addressed with the ORDINAL the command body binds
 * (`statusCommandValue('Inactive')` → 1, `statusCommandValue('Active')` → 0) and
 * never with the record's `status` string: the body is
 * `[JsonRequired] int Status`, so `{"status":"Active"}` is a JSON binding
 * failure. Reactivation is the same route with the other ordinal; nothing else
 * about the write changes.
 *
 * There is no delete route in this module. Deactivation is the only removal
 * mechanism a site has, which is why the same command serves both directions.
 */
export function useSetSiteStatusMutation() {
  const invalidate = useInvalidateSites()
  return useMutation({
    mutationFn: ({ siteId, status }: SetSiteStatusVariables) =>
      organizationService.setSiteStatus(siteId, {
        status: statusCommandValue[status],
      }),
    onSuccess: invalidate,
  })
}
