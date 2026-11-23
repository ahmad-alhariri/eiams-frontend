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
const NAME_TOO_LONG_MESSAGE = 'يجب ألّا يتجاوز اسم الموظف 200 محرف.'
const JOB_TITLE_TOO_LONG_MESSAGE = 'يجب ألّا يتجاوز المسمى الوظيفي 100 محرف.'
const EMAIL_INVALID_MESSAGE = 'البريد الإلكتروني غير صحيح.'
const EMAIL_ASCII_MESSAGE = 'يجب أن يحتوي البريد الإلكتروني على محارف ASCII فقط.'
const EMAIL_TOO_LONG_MESSAGE = 'يجب ألّا يتجاوز البريد الإلكتروني 256 محرفاً.'
const PHONE_REQUIRED_MESSAGE = 'رقم الهاتف المحمول مطلوب.'
const PHONE_INVALID_MESSAGE =
  'أدخل رقمًا سوريًا صحيحًا بصيغة 0931234567 أو +963931234567.'
const PHONE_TOO_LONG_MESSAGE = 'يجب ألّا يتجاوز رقم الهاتف 20 محرفاً.'

/** Mirrors the backend `EmployeeContactRules` — the backend is the final reference (K-4). */
export const EMPLOYEE_EMAIL_MAX_LENGTH = 256
/** `^(\+963|0?)9[3-9]\d{7}$` after stripping spaces and dashes. */
export const SYRIAN_MOBILE_PATTERN = /^(\+963|0?)9[3-9]\d{7}$/

/**
 * Accepts a national (`0?9X...`) or international (`+963...`) Syrian mobile number,
 * strips spaces/dashes and returns the canonical international form `+9639XXXXXXXX`.
 * Returns `null` for a blank or invalid value; the schema rejects such input before
 * a request is ever sent.
 */
export function normalizeSyrianMobile(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null

  const stripped = value.replace(/[\s-]/g, '')
  if (!SYRIAN_MOBILE_PATTERN.test(stripped)) return null

  let local = stripped
  if (stripped.startsWith('+963')) {
    local = stripped.slice(4)
  } else if (stripped.startsWith('0')) {
    local = stripped.slice(1)
  }

  return `+963${local}`
}

/**
 * Optional e-mail: when a value is supplied it must pass the approved User.Email rules
 * (`z.email()`, the same rule the admin user form uses) plus the backend ASCII-only
 * restriction and the 256-character maximum. Blank is treated as "not supplied" and
 * is mapped to `null` on the wire.
 */
const employeeEmailSchema = z
  .string()
  .trim()
  .max(EMPLOYEE_EMAIL_MAX_LENGTH, EMAIL_TOO_LONG_MESSAGE)
  .refine((value) => value === '' || z.email().safeParse(value).success, EMAIL_INVALID_MESSAGE)
  .refine((value) => Array.from(value).every((char) => char.charCodeAt(0) <= 0x7f), EMAIL_ASCII_MESSAGE)

/**
 * One form shape for both employee operations, with the create-only fields
 * required only in create mode: `POST /employees` binds `orgUnitId` and
 * `employeeNumber`, `PUT /employees/{id}` binds neither — so re-assigning an
 * employee to another organizational unit is not exposed by this contract.
 *
 * The wire names are the form names: `fullName` (not `fullNameAr`) and
 * `jobTitle` (not `jobTitleAr`). Both contact fields are bound by both bodies,
 * email as optional and phone as mandatory. There is no `status` because neither
 * body binds it, and no `rowVersion` because Employee is NOT a versioned aggregate.
 */
export function employeeFormSchema(isCreate: boolean) {
  return z.object({
    // Create-only: shown read-only on edit and never sent to the update body.
    orgUnitId: isCreate ? z.uuid(ORG_UNIT_MESSAGE) : z.string(),
    employeeNumber: isCreate
      ? z.string().trim().min(1, NUMBER_REQUIRED_MESSAGE).max(50, NUMBER_TOO_LONG_MESSAGE)
      : z.string().trim().max(50, NUMBER_TOO_LONG_MESSAGE),
    // Both bodies bind these two, so both modes require the name.
    fullName: z.string().trim().min(1, NAME_REQUIRED_MESSAGE).max(200, NAME_TOO_LONG_MESSAGE),
    jobTitle: z.string().trim().max(100, JOB_TITLE_TOO_LONG_MESSAGE).optional(),
    email: employeeEmailSchema.optional(),
    phone: z
      .string()
      .trim()
      .min(1, PHONE_REQUIRED_MESSAGE)
      .max(20, PHONE_TOO_LONG_MESSAGE)
      .refine((value) => normalizeSyrianMobile(value) !== null, PHONE_INVALID_MESSAGE),
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
    email: '',
    phone: '',
  }
}

/**
 * Seeds the form from an employee READ record. The projection carries a flat
 * `orgUnitId` and no nested `orgUnit` object, so the unit identifier is read
 * straight off the record. The phone returned by the backend is already canonical;
 * the optional email maps to an empty string when absent.
 */
export function toEmployeeFormValues(employee: Employee | null): EmployeeFormValues {
  if (employee === null) return emptyEmployeeFormValues()
  return {
    orgUnitId: employee.orgUnitId,
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    jobTitle: employee.jobTitle ?? '',
    email: employee.email ?? '',
    phone: employee.phone ?? '',
  }
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? null : trimmed
}

/**
 * Maps create values to `POST /employees`: `orgUnitId`, `fullName`,
 * `employeeNumber`, `jobTitle`, `email` and the canonical `phone` — and nothing
 * else. No `status` (neither body binds it) and no concurrency token.
 */
export function toCreateEmployeeRequest(values: EmployeeFormValues): EmployeeCreateRequest {
  return {
    orgUnitId: values.orgUnitId,
    fullName: values.fullName.trim(),
    employeeNumber: values.employeeNumber.trim(),
    jobTitle: optionalText(values.jobTitle),
    email: optionalText(values.email),
    phone: normalizeSyrianMobile(values.phone) ?? values.phone.trim(),
  }
}

/**
 * Maps edit values to `PUT /employees/{id}`: the create-only `orgUnitId` and
 * `employeeNumber` are dropped, `status` is dropped because Employee has no
 * status command, and both contact fields are included in canonical form.
 */
export function toUpdateEmployeeRequest(values: EmployeeFormValues): EmployeeUpdateRequest {
  return {
    fullName: values.fullName.trim(),
    jobTitle: optionalText(values.jobTitle),
    email: optionalText(values.email),
    phone: normalizeSyrianMobile(values.phone) ?? values.phone.trim(),
  }
}
