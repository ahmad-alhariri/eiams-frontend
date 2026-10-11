import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import {
  statusCommandValue,
  type EmployeeCreateRequest,
  type EmployeeUpdateRequest,
  type RecordStatus,
} from '@/modules/organization/types/organization.types'

type UpdateEmployeeVariables = {
  employeeId: string
  request: EmployeeUpdateRequest
}

/**
 * Status-command variables, in the LANGUAGE OF THE RECORD.
 *
 * The caller passes the status it read off the row (`'Active'` / `'Inactive'`)
 * and this hook performs the only conversion the wire allows:
 * `statusCommandValue` maps the domain enum to the ORDINAL `PUT
 * /employees/{id}/status` binds. The mapping lives here, at the boundary, so no
 * page has to remember that a status WRITE is an integer while a status READ is
 * a string — and no page writes a bare `0`/`1` that reads as a falsy guard.
 */
type SetEmployeeStatusVariables = {
  employeeId: string
  status: RecordStatus
}

function useInvalidateEmployees() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey === undefined) return

    await queryClient.invalidateQueries({
      queryKey: queryKeys.scoped(activeScopeCacheKey, 'organization', 'employees'),
      exact: false,
    })
  }
}

export function useCreateEmployeeMutation() {
  const invalidate = useInvalidateEmployees()
  return useMutation({
    mutationFn: (request: EmployeeCreateRequest) => organizationService.createEmployee(request),
    // Passed by reference rather than wrapped in `({ employeeId }) => ...`:
    // create resolves with `{ id }` and update with NOTHING at all, so a handler
    // that destructures the response throws on update. The invalidation needs no
    // response value — it invalidates the whole `employees` resource key, list
    // and detail alike, because the key prefix matches both.
    onSuccess: invalidate,
  })
}

export function useUpdateEmployeeMutation() {
  const invalidate = useInvalidateEmployees()
  return useMutation({
    mutationFn: ({ employeeId, request }: UpdateEmployeeVariables) =>
      organizationService.updateEmployee(employeeId, request),
    // `updateEmployee` answers with an EMPTY body, so `data` is `undefined`. The
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
 * mechanism an employee has, which is why one command serves both directions.
 */
export function useSetEmployeeStatusMutation() {
  const invalidate = useInvalidateEmployees()
  return useMutation({
    mutationFn: ({ employeeId, status }: SetEmployeeStatusVariables) =>
      organizationService.setEmployeeStatus(employeeId, {
        status: statusCommandValue[status],
      }),
    onSuccess: invalidate,
  })
}
