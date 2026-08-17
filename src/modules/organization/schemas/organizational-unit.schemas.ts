import { z } from 'zod'

import type {
  OrganizationalUnit,
  OrganizationalUnitUpsertRequest,
} from '@/shared/types/generated/eiams-v1'

const UUID_MESSAGE = 'يجب اختيار قيمة صالحة من القائمة.'

/** Form-owned fields for the contract-backed organizational-unit upsert request. */
export const organizationalUnitSchema = z.object({
  siteId: z.uuid(UUID_MESSAGE),
  parentOrgUnitId: z.union([z.literal(''), z.uuid(UUID_MESSAGE)]),
  code: z
    .string()
    .trim()
    .min(1, 'رمز الوحدة التنظيمية مطلوب.')
    .max(50, 'رمز الوحدة التنظيمية يجب ألّا يتجاوز 50 محرفاً.'),
  nameAr: z
    .string()
    .trim()
    .min(2, 'اسم الوحدة التنظيمية يجب أن يتكون من حرفين على الأقل.')
    .max(200, 'اسم الوحدة التنظيمية يجب ألّا يتجاوز 200 محرف.'),
  status: z.enum(['Active', 'Inactive']),
})

export type OrganizationalUnitFormValues = z.infer<typeof organizationalUnitSchema>

/** Maps form values to the exact generated v1 upsert request shape. */
export function toOrganizationalUnitRequest(
  values: OrganizationalUnitFormValues,
  unit: OrganizationalUnit | null,
): OrganizationalUnitUpsertRequest {
  return {
    siteId: values.siteId,
    ...(values.parentOrgUnitId === '' ? {} : { parentOrgUnitId: values.parentOrgUnitId }),
    code: values.code.trim(),
    nameAr: values.nameAr.trim(),
    status: values.status,
    rowVersion: unit?.rowVersion ?? 0,
  }
}

/**
 * The list contract exposes enough local structure to reject a self-parent,
 * a descendant-parent (cycle), and a parent from a different site. Missing
 * links are left to the server because the paged contract may be incomplete.
 */
export function isInvalidOrganizationalUnitParent(
  parentOrgUnitId: string,
  siteId: string,
  unit: OrganizationalUnit | null,
  units: readonly OrganizationalUnit[],
): boolean {
  if (parentOrgUnitId === '') {
    return false
  }

  const unitsById = new Map(units.map((candidate) => [candidate.orgUnitId, candidate]))
  const parent = unitsById.get(parentOrgUnitId)
  if (parent === undefined || parent.siteId !== siteId || parent.orgUnitId === unit?.orgUnitId) {
    return true
  }

  if (unit === null) {
    return false
  }

  const visited = new Set<string>()
  let candidate: OrganizationalUnit | undefined = parent
  while (candidate !== undefined) {
    if (candidate.orgUnitId === unit.orgUnitId || visited.has(candidate.orgUnitId)) {
      return true
    }
    visited.add(candidate.orgUnitId)
    candidate =
      candidate.parentOrgUnitId === undefined ? undefined : unitsById.get(candidate.parentOrgUnitId)
  }

  return false
}
