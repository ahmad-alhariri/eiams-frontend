/**
 * The six approved organizational unit types, highest level first. The backend
 * is the final authority: it stores and accepts these Arabic values and
 * rejects every other value (SYS-SETUP-06.5, decisions C1-C5).
 */
export const ORGANIZATIONAL_UNIT_TYPE_VALUES = [
  'قطاع',
  'مديرية',
  'إدارة',
  'قسم',
  'شعبة',
  'مكتب',
] as const

export type OrganizationalUnitType = (typeof ORGANIZATIONAL_UNIT_TYPE_VALUES)[number]

export const ORGANIZATIONAL_UNIT_TYPE_OPTIONS: ReadonlyArray<{
  value: OrganizationalUnitType
  label: string
}> = ORGANIZATIONAL_UNIT_TYPE_VALUES.map((value) => ({ value, label: value }))

export const isOrganizationalUnitType = (value: string): value is OrganizationalUnitType =>
  (ORGANIZATIONAL_UNIT_TYPE_VALUES as ReadonlyArray<string>).includes(value)

/**
 * Non-guarding membership check. The zod schema uses it so the form value type
 * stays a plain string (an empty form value must stay assignable) while every
 * unapproved value is still rejected at validation time.
 */
export function isApprovedOrganizationalUnitType(value: string): boolean {
  return (ORGANIZATIONAL_UNIT_TYPE_VALUES as ReadonlyArray<string>).includes(value)
}
