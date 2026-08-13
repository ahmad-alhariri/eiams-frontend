/**
 * Canonical v1 permission vocabulary (D-RBAC-01).
 *
 * Source of truth: docs/route-permission-scope-matrix.md. Sync with the
 * OpenAPI `SessionResponse.permissionCodes` values and the seeded
 * /admin/permissions catalog. The frontend enforces visibility only; the
 * server re-evaluates every request, state transition, and policy action.
 * Any code not present here never grants anything in a guard.
 */

export const PERMISSION_CODES = [
  'catalog.view',
  'catalog.manage',
  'organization.view',
  'organization.manage',
  'warehouse.view',
  'warehouse.manage',
  'inventory.view',
  'document.view',
  'document.create',
  'document.update',
  'document.submit',
  'document.post',
  'document.reject',
  'document.revise',
  'document.cancel',
  'document.reverse',
  'count.view',
  'count.plan',
  'count.enter',
  'count.complete',
  'count.close',
  'asset.view',
  'custody.assign',
  'audit.view',
  'report.view',
  'admin.user.view',
  'admin.user.manage',
  'admin.role.view',
  'admin.role.manage',
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(value)
}
