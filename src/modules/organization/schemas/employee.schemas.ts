import { z } from 'zod'

import type {
  Employee,
  EmployeeCreateRequest,
  EmployeeUpdateRequest,
} from '@/modules/organization/types/organization.types'

const ORG_UNIT_MESSAGE = 'يجب اختيار وحدة تنظيمية صالحة من القائمة.'
const NUMBER_REQUIRED_MESSAGE = 'الرقم الوظيفي مطلوب.'
const NUMBER_TOO_LONG_MESSAGE = 'يجب ألّا يتجاوز الرقم الوظيفي 50 محرفاً.'
const NAME_REQUIRED_MESSAGE = 'اسم الموظف مطلوب.'
const NAME_TOO_LONG_MESSAGE = 'يجب ألّا يتجاوز اسم الموظف 250 محرف.'
const JOB_TITLE_TOO_LONG_MESSAGE = 'يجب ألّا يتجاوز المسمى الوظيفي 200 محرف.'

/**
 * One form shape for both employee operations, with the create-only fields
 * required only in create mode: `POST /employees` binds `orgUnitId` and
 * `employeeNumber`, `PUT /employees/{id}` binds neither — so re-assigning an
 * employee to another organizational unit is not exposed by this contract.
 *
 * The wire names are the form names: `fullName` (not `fullNameAr`) and
 * `jobTitle` (not `jobTitleAr`). There is no `status` because neither body
 * binds it, and no `rowVersion` because Employee is NOT a versioned aggregate.
 */
export function employeeFormSchema(isCreate: boolean) {
  return z.object({
    // Create-only: shown read-only on edit and never sent to the update body.
    orgUnitId: isCreate ? z.uuid(ORG_UNIT_MESSAGE) : z.string(),
    employeeNumber: isCreate
      ? z.string().trim().min(1, NUMBER_REQUIRED_MESSAGE).max(50, NUMBER_TOO_LONG_MESSAGE)
      : z.string().trim().max(50, NUMBER_TOO_LONG_MESSAGE),
    // Both bodies bind these two, so both modes require the name.
    fullName: z.string().trim().min(1, NAME_REQUIRED_MESSAGE).max(250, NAME_TOO_LONG_MESSAGE),
    jobTitle: z.string().trim().max(200, JOB_TITLE_TOO_LONG_MESSAGE).optional(),
  })
}

export type EmployeeFormValues = z.infer<ReturnType<typeof employeeFormSchema>>

/** Fresh empty values for a create form (never a shared mutable object). */
export function emptyEmployeeFormValues(): EmployeeFormValues {
  return {
    orgUnitId: '',
    employeeNumber: '',
    fullName: '',
    jobTitle: '',
  }
}

/**
 * Seeds the form from an employee READ record. The projection carries a flat
 * `orgUnitId` and no nested `orgUnit` object, so the unit identifier is read
 * straight off the record; there is no `fullNameAr`, `jobTitleAr` or
 * `rowVersion` to read.
 */
export function toEmployeeFormValues(employee: Employee | null): EmployeeFormValues {
  if (employee === null) return emptyEmployeeFormValues()
  return {
    orgUnitId: employee.orgUnitId,
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    jobTitle: employee.jobTitle ?? '',
  }
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? null : trimmed
}

/**
 * Maps create values to `POST /employees`: `orgUnitId`, `fullName`,
 * `employeeNumber`, `jobTitle` — and nothing else. No `status` (neither body
 * binds it) and no concurrency token.
 */
export function toCreateEmployeeRequest(values: EmployeeFormValues): EmployeeCreateRequest {
  return {
    orgUnitId: values.orgUnitId,
    fullName: values.fullName.trim(),
    employeeNumber: values.employeeNumber.trim(),
    jobTitle: optionalText(values.jobTitle),
  }
}

/**
 * Maps edit values to `PUT /employees/{id}`: the create-only `orgUnitId` and
 * `employeeNumber` are dropped because the body binds neither, and `status` is
 * dropped because Employee has no status command.
 */
export function toUpdateEmployeeRequest(values: EmployeeFormValues): EmployeeUpdateRequest {
  return {
    fullName: values.fullName.trim(),
    jobTitle: optionalText(values.jobTitle),
  }
}
