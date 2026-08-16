import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { organizationService } from '@/modules/organization/services/organization.service'
import { queryKeys } from '@/shared/services/query-keys'
import type { EmployeeUpsertRequest } from '@/shared/types/generated/eiams-v1'

type UpdateEmployeeVariables = {
  employeeId: string
  request: EmployeeUpsertRequest
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
  return useMutation({ mutationFn: organizationService.createEmployee, onSuccess: invalidate })
}

export function useUpdateEmployeeMutation() {
  const invalidate = useInvalidateEmployees()
  return useMutation({
    mutationFn: ({ employeeId, request }: UpdateEmployeeVariables) =>
      organizationService.updateEmployee(employeeId, request),
    onSuccess: invalidate,
  })
}
