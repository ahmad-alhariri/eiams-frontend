/**
 * Shared role-scope vocabulary, moved byte-for-byte from
 * admin/types/role.types.ts so auth and admin depend on one definition with no
 * auth -> admin module edge (module-level import cycle break, P1-2-CYCLES).
 */

/**
 * Assignment scope types. `UserAssignmentScopeType` on the backend;
 * OrganizationalUnit is never an assignment scope (RESOLUTION-013).
 *
 * The backend serialises this enum through an explicit `JsonStringEnumConverter`,
 * so the wire value is the member name and never the ordinal.
 */

export type RoleScopeType = 'Enterprise' | 'Site' | 'Warehouse'

/** Arabic display labels for the assignment scope types (ui-design.md, RTL-first). */
export const ROLE_SCOPE_TYPE_LABELS_AR: Readonly<Record<RoleScopeType, string>> = {
  Enterprise: 'مستوى المؤسسة',
  Site: 'موقع',
  Warehouse: 'مستودع',
}
