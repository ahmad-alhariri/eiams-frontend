/**
 * Canonical v1 permission vocabulary — D-RBAC-01 (29-code dotted set).
 *
 * Source of truth: docs/route-permission-scope-matrix.md (§3.1) and
 * docs/integration/rbac-legacy-to-dotted-mapping-v1.md (approved 2026-09-13).
 * Naming convention: resource.verb, all lowercase, ASCII, dot separator.
 *
 * Vocabulary is open-ended by design; the session carries an open string
 * array (`D-AUTH-01`). The table below is the approved v1 baseline; any
 * code not listed here never grants visibility in a guard. The server
 * owns authority; this layer only enforces visibility.
 */
export const PERMISSION_CODES = [
  // Catalog (Enterprise scope — catalog.manage implies catalog.view)
  'catalog.view',
  'catalog.manage',

  // Organization (Enterprise scope — organization.manage implies view)
  'organization.view',
  'organization.manage',

  // Warehouse structure (Enterprise scope — warehouse.manage implies view)
  'warehouse.view',
  'warehouse.manage',

  // Inventory (Any scope — balances + movement-ledger read)
  'inventory.view',

  // Document lifecycle (Document warehouse scope — D-LIFE-01)
  'document.view',
  'document.create',
  'document.update',
  'document.submit',
  'document.post',
  'document.reject',
  'document.revise',
  'document.cancel',
  'document.reverse',

  // Count lifecycle (Count warehouse scope — D-INV-COUNT-01)
  'count.view',
  'count.plan',
  'count.enter',
  'count.complete',
  'count.close',

  // Assets + custody (Warehouse/site scope)
  'asset.view',
  'custody.assign',

  // Audit (Typically Enterprise; server redacts per D-AUD-02)
  'audit.view',

  // Reports (Governance / GOVERN axis — D-RBAC-02)
  'report.view',

  // Administration (Enterprise — SYSTEM_ADMIN only; D-RBAC-02)
  'admin.user.view',
  'admin.user.manage',
  'admin.role.view',
  'admin.role.manage',
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(value)
}
