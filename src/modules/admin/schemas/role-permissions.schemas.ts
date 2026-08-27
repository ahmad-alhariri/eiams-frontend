import { z } from 'zod'

import type { Permission, Role, RoleUpsertRequest } from '@/shared/types/generated/eiams-v1'

/**
 * The permission catalog is server-owned. This form only carries the selected
 * codes from that catalog; it deliberately adds no client-side vocabulary or
 * role-policy rules.
 */
export const rolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string()),
})

export type RolePermissionsFormValues = z.infer<typeof rolePermissionsSchema>

/** One selectable row of the role permission matrix. */
export type PermissionMatrixRow = Pick<Permission, 'code' | 'descriptionAr' | 'nameAr'>

/**
 * Includes any code already returned on the role even when its catalog entry
 * is temporarily absent. The code is server-authored and remains preserved by
 * a replacement request instead of silently being revoked by the client.
 */
export function toPermissionMatrixRows(
  catalog: readonly Permission[],
  selectedCodes: readonly string[],
): readonly PermissionMatrixRow[] {
  const catalogCodes = new Set(catalog.map((permission) => permission.code))
  const unavailableRows = selectedCodes
    .filter((code) => !catalogCodes.has(code))
    .map((code) => ({ code, nameAr: code, descriptionAr: null }))
  return [...catalog, ...unavailableRows]
}

/**
 * PUT replaces the complete role record in the v1 contract. Preserve every
 * non-permission field and the server-provided row version verbatim.
 */
export function toRolePermissionsRequest(
  values: RolePermissionsFormValues,
  role: Role,
): RoleUpsertRequest {
  return {
    code: role.code,
    nameAr: role.nameAr,
    permissionCodes: values.permissionCodes,
    rowVersion: role.rowVersion,
    status: role.status,
  }
}
