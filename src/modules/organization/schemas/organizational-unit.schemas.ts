import { z } from 'zod'

import type { OrganizationalUnitUpsertRequest } from '@/modules/organization/types/organization.types'

export const organizationalUnitSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'اسم الوحدة التنظيمية مطلوب.')
    .max(200, 'اسم الوحدة التنظيمية يجب ألّا يتجاوز 200 محرف.'),
  code: z
    .string()
    .trim()
    .min(1, 'رمز الوحدة التنظيمية مطلوب.')
    .max(20, 'رمز الوحدة التنظيمية يجب ألّا يتجاوز 20 محرفاً.'),
  status: z.enum(['Active', 'Inactive']),
  siteId: z.string().min(1, 'الموقع مطلوب.'),
  parentOrgUnitId: z.string().optional(),
  rowVersion: z.number().int().nonnegative(),
})

export type OrganizationalUnitFormValues = z.infer<typeof organizationalUnitSchema>

/** Convert form values into the contract request shape. */
export function toOrganizationalUnitRequest(
  values: OrganizationalUnitFormValues,
): OrganizationalUnitUpsertRequest {
  return {
    nameAr: values.displayName,
    code: values.code,
    siteId: values.siteId,
    parentOrgUnitId:
      values.parentOrgUnitId === undefined || values.parentOrgUnitId === ''
        ? null
        : values.parentOrgUnitId,
    status: values.status,
    rowVersion: values.rowVersion,
  }
}

/**
 * Returns true when selecting `parent` as the parent of `unit` would create a cycle.
 * A unit cannot be its own parent, and descendants cannot become parents.
 */
export function isInvalidOrganizationalUnitParent(
  unit: { orgUnitId: string; parentOrgUnitId?: string | null } | null | undefined,
  parent: { orgUnitId: string } | null | undefined,
  allUnits: ReadonlyArray<{ orgUnitId: string; parentOrgUnitId?: string | null }>,
): boolean {
  if (unit === null || unit === undefined) return false
  if (parent === null || parent === undefined) return false
  if (parent.orgUnitId === unit.orgUnitId) return true
  if (parent.orgUnitId === unit.parentOrgUnitId) return true

  // Walk up the parent chain from `parent` to detect a cycle.
  const childToParent = new Map<string, string | null>()
  for (const u of allUnits) {
    childToParent.set(u.orgUnitId, u.parentOrgUnitId ?? null)
  }

  let current: string | null = parent.orgUnitId
  const seen = new Set<string>()
  while (current !== null) {
    if (current === unit.orgUnitId) return true
    if (seen.has(current)) return true // pre-existing cycle in the data
    seen.add(current)
    current = childToParent.get(current) ?? null
  }
  return false
}
