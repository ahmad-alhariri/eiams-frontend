import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import type {
  EmployeeCreateRequest,
  EmployeeUpdateRequest,
} from '@/modules/organization/types/organization.types'

type UpdateEmployeeVariables = {
  employeeId: string
  request: EmployeeUpdateRequest
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
