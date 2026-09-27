import type { PermissionCode } from '@/config/permissions'
import type { RouteKey } from '@/config/routes'

/**
 * Approved v1 role-and-scope permission sets — the verification ground truth
 * for `eiams-frontend-e24-t06` (Verify RBAC and scope across all modules).
 *
 * ## Source of truth
 *
 * These sets are transcribed from the **human-approved 2026-09-13 policy**, not
 * from the role table in the repository copy of
 * `docs/route-permission-scope-matrix.md`, which is stale:
 *
 * - `docs/integration/rbac-authorization-policy-v1-draft.md` §3 "Approved
 *   effective permission sets" — the role × scope rows.
 * - `docs/route-permission-scope-matrix.md` → Addendum D-RBAC-03 (Site scope is
 *   oversight only; only Warehouse may hold OPERATE) and §7 human decisions.
 * - `docs/integration/rbac-legacy-to-dotted-mapping-v1.md` §"Explicitly approved
 *   policy choices" and §"Role conversion".
 *
 * ## Superseded readings this file deliberately does NOT encode
 *
 * | Stale reading | Correct position (source) |
 * | --- | --- |
 * | `SYSTEM_ADMIN` holds "all v1 codes" | 10 structural codes at Enterprise only; **no** `audit.view`, **no** `report.view` (policy §3, §7.2) |
 * | `WH_MGR` @ Enterprise/Site holds all engine codes | GOVERN only (D-RBAC-02, D-RBAC-03) |
 * | `WH_MGR` holds `document.submit` and `document.revise` | Warehouse `WH_MGR` gets neither; generic preparation is a keeper workflow (policy §3) |
 * | `DATA_MANAGER` is one of five seeded roles | **Deferred — not seeded in v1** (policy §3, mapping §Role conversion) |
 *
 * ## Why this is a test fixture and not production code
 *
 * D-RBAC-01 explicitly rejects client-side role gating ("roles are
 * assignments, not authorization"). The frontend must never branch on a role
 * name; it branches on the `permissionCodes` the **server** computes for the
 * user's sole assignment. D-RBAC-03 makes that explicit: the scope-aware
 * effective-permission calculation is a **server** responsibility, and the
 * frontend simply receives fewer codes.
 *
 * So these rows exist to *drive sessions into the real guards and assert what
 * they do* — never to become an authorization source. `src/config/routes.ts` and
 * `usePermission` remain the only frontend sources of truth; a test that failed
 * here means the wiring diverged from the approved policy, which is exactly the
 * signal this workstream exists to produce.
 */

export type ApprovedScopeType = 'Enterprise' | 'Site' | 'Warehouse'

export interface ApprovedRoleGrant {
  readonly role: string
  readonly scopeType: ApprovedScopeType
  readonly permissionCodes: readonly PermissionCode[]
  /** One-line justification quoted from the approved policy. */
  readonly boundary: string
}

/** GOVERN read set: the only permissions a supervision-only scope may hold. */
const GOVERN_READ: readonly PermissionCode[] = [
  'catalog.view',
  'organization.view',
  'warehouse.view',
  'inventory.view',
  'document.view',
  'count.view',
  'asset.view',
  'report.view',
]

/** Manager lifecycle actions retained only at Warehouse scope. */
const WAREHOUSE_MANAGER_OPERATE: readonly PermissionCode[] = [
  'document.create',
  'document.update',
  'document.post',
  'document.reject',
  'document.cancel',
  'document.reverse',
  'count.plan',
  'count.complete',
  'count.close',
]

const SYSTEM_ADMIN_STRUCTURAL: readonly PermissionCode[] = [
  'catalog.view',
  'catalog.manage',
  'organization.view',
  'organization.manage',
  'warehouse.view',
  'warehouse.manage',
  'admin.user.view',
  'admin.user.manage',
  'admin.role.view',
  'admin.role.manage',
]

const KEEPER_WORKFLOW: readonly PermissionCode[] = [
  'catalog.view',
  'organization.view',
  'warehouse.view',
  'inventory.view',
  'document.view',
  'document.create',
  'document.update',
  'document.submit',
  'document.revise',
  'document.cancel',
  'count.view',
  'count.enter',
  'asset.view',
  'custody.assign',
  'report.view',
]

const AUDITOR_READONLY: readonly PermissionCode[] = [
  // "Context views plus ..." — the context views are the three reference reads.
  'catalog.view',
  'organization.view',
  'warehouse.view',
  'inventory.view',
  'document.view',
  'count.view',
  'asset.view',
  'audit.view',
  'report.view',
]

/**
 * The approved v1 baseline rows, one per role × assigned scope.
 *
 * A user holds exactly one of these (D-SRS-01 single role / single scope).
 */
export const APPROVED_ROLE_GRANTS: readonly ApprovedRoleGrant[] = [
  {
    role: 'SYSTEM_ADMIN',
    scopeType: 'Enterprise',
    permissionCodes: SYSTEM_ADMIN_STRUCTURAL,
    boundary:
      'May configure organization, sites, warehouses, capabilities, catalog, employees, users, and roles. Must not create, submit, post, reject, reverse, count, adjust, or dispose inventory documents.',
  },
  {
    role: 'WH_MGR',
    scopeType: 'Enterprise',
    permissionCodes: GOVERN_READ,
    boundary: 'GOVERN only over all descendant warehouses. No OPERATE action.',
  },
  {
    role: 'WH_MGR',
    scopeType: 'Site',
    permissionCodes: GOVERN_READ,
    boundary:
      'GOVERN only. No OPERATE action, even for a warehouse belonging to that site (D-RBAC-03).',
  },
  {
    role: 'WH_MGR',
    scopeType: 'Warehouse',
    permissionCodes: [...GOVERN_READ, ...WAREHOUSE_MANAGER_OPERATE],
    boundary:
      'Owns manager review and manager-only adjustment/disposal work. Generic document preparation remains a keeper workflow even though an adjustment needs manager create/update.',
  },
  {
    role: 'WH_KEEPER',
    scopeType: 'Warehouse',
    permissionCodes: KEEPER_WORKFLOW,
    boundary:
      'Prepares routine documents and enters actual count quantities. Never posts, rejects, reverses, plans/completes/closes a count, or performs Adjustment/Disposal.',
  },
  {
    role: 'AUDITOR',
    scopeType: 'Enterprise',
    permissionCodes: AUDITOR_READONLY,
    boundary: 'Read-only; scope limits which operational data may be read.',
  },
  {
    role: 'AUDITOR',
    scopeType: 'Site',
    permissionCodes: AUDITOR_READONLY,
    boundary: 'Read-only; scope limits which operational data may be read.',
  },
  {
    role: 'AUDITOR',
    scopeType: 'Warehouse',
    permissionCodes: AUDITOR_READONLY,
    boundary: 'Read-only; scope limits which operational data may be read.',
  },
]

/** Roles explicitly deferred and therefore not seeded in v1. */
export const DEFERRED_ROLES: readonly string[] = ['DATA_MANAGER']

/** Effective codes for one approved role × scope row. */
export function approvedGrant(role: string, scopeType: ApprovedScopeType): ApprovedRoleGrant {
  const grant = APPROVED_ROLE_GRANTS.find(
    (candidate) => candidate.role === role && candidate.scopeType === scopeType,
  )
  if (grant === undefined) {
    throw new Error(`No approved grant for ${role} at ${scopeType} scope.`)
  }
  return grant
}

/**
 * Routes a session carrying these codes may reach, derived with the production
 * predicate so the expectation can never drift from the shipped guard logic.
 */
export function routesReachableWith(
  codes: readonly string[],
  hasRoutePermission: (codes: readonly string[], route: RouteKey) => boolean,
  routes: readonly RouteKey[],
): RouteKey[] {
  return routes.filter((route) => hasRoutePermission(codes, route))
}
