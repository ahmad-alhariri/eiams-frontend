import { z } from 'zod'

import type { Employee, EmployeeUpsertRequest } from '@/shared/types/generated/eiams-v1'

const UUID_MESSAGE = 'يجب اختيار وحدة تنظيمية صالحة من القائمة.'

/** Form-owned fields for the contract-backed employee upsert request. */
export const employeeSchema = z.object({
  employeeNumber: z
    .string()
    .trim()
    .min(1, 'الرقم الوظيفي مطلوب.')
    .max(50, 'يجب ألّا يتجاوز الرقم الوظيفي 50 محرفاً.'),
  fullNameAr: z
    .string()
    .trim()
    .min(1, 'اسم الموظف مطلوب.')
    .max(250, 'يجب ألّا يتجاوز اسم الموظف 250 محرف.'),
  jobTitleAr: z.string().trim().max(200, 'يجب ألّا يتجاوز المسمى الوظيفي 200 محرف.').optional(),
  orgUnitId: z.uuid(UUID_MESSAGE),
  status: z.enum(['Active', 'Inactive']),
})

export type EmployeeFormValues = z.infer<typeof employeeSchema>

/** Maps UI values to the exact v1 payload and keeps optimistic locking intact. */
export function toEmployeeRequest(
  values: EmployeeFormValues,
  employee: Employee | null,
): EmployeeUpsertRequest {
  const jobTitleAr = values.jobTitleAr?.trim()
  return {
    employeeNumber: values.employeeNumber.trim(),
    fullNameAr: values.fullNameAr.trim(),
    ...(jobTitleAr === undefined || jobTitleAr === '' ? {} : { jobTitleAr }),
    orgUnitId: values.orgUnitId,
    rowVersion: employee?.rowVersion ?? 0,
    status: values.status,
  }
}
