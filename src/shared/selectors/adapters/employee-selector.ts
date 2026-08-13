import type { Employee } from '@/shared/types/generated/eiams-v1'

import {
  createEntitySelectorAdapter,
  useScopedEntityOptions,
  type EntityLoader,
  type EntitySelectorAdapter,
  type EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'

export type EmployeeLoader = EntityLoader<Employee>

/**
 * Employee selector adapter: label = full Arabic name, hint = job title (carried
 * in the payload), and inactive employees are disabled. Typed against the full
 * `Employee` contract entity — no dedicated EmployeeReference type exists.
 */
const employeeAdapter: EntitySelectorAdapter<Employee> = createEntitySelectorAdapter<Employee>({
  toOption: (employee) => ({
    value: employee.employeeId,
    label: employee.fullNameAr,
    disabled: employee.status !== 'Active',
    payload: employee,
  }),
})

/**
 * Scope-ready employee selector. Injected loaders keep the component free of
 * HTTP concerns; see {@link useScopedEntityOptions} for normalization behaviour.
 */
export function useEmployeeSelector(loadEmployees: EmployeeLoader): EntitySelectorResult<Employee> {
  const loadOptions = useScopedEntityOptions(employeeAdapter, loadEmployees)
  return { options: employeeAdapter, loadOptions }
}
