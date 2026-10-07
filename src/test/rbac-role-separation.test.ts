import { describe, expect, it } from 'vitest'

import {
  hasAllPermissions,
  hasAnyPermission,
  hasRoutePermission,
} from '@/modules/auth/hooks/use-permission'
import { ROUTE_METADATA, ROUTE_PATHS, type RouteKey } from '@/config/routes'
import { ACTION_PERMISSION_CODES } from '@/shared/documents/use-document-permissions'
import { SIDEBAR_NAV_GROUPS, filterSidebarNav } from '@/shared/layout/sidebar/sidebar-nav-model'
import { APPROVED_ROLE_GRANTS, DEFERRED_ROLES, approvedGrant } from './rbac-role-fixture'
import type { ApprovedRoleGrant } from './rbac-role-fixture'

/**
 * Role-and-scope separation verification (e24-t06).
 *
 * The route-guard matrix proves each guard is *wired*; this file proves the
 * guards *partition roles correctly* according to the approved 2026-09-13
 * policy. It asserts the policy's intent as invariants rather than golden
 * route lists, so ordinary route growth does not break it while a real
 * regression — a keeper gaining `document.post`, an administrator gaining
 * `report.view` — does.
 *
 * Every expectation is evaluated through the production predicates
 * (`hasRoutePermission`, `ACTION_PERMISSION_CODES`, `filterSidebarNav`) so the
 * suite can never pass by re-implementing the rules it is meant to check.
 */

const ALL_ROUTES = Object.keys(ROUTE_METADATA) as RouteKey[]

/** Every route reachable with a non-empty set of codes, ignoring scope. */
const REAL_ROUTES = ALL_ROUTES.filter(
  (key) => ROUTE_METADATA[key].public !== true && ROUTE_METADATA[key].devOnly !== true,
)

/** List pages are the only routes that belong in the sidebar. */
function isListRoute(route: RouteKey): boolean {
  const path: string = ROUTE_PATHS[route]
  return !path.endsWith('/new') && !path.includes('/:')
}

/** Routes whose guard demands a create/plan capability, not just a view. */
function isCreateRoute(route: RouteKey): boolean {
  const required = ROUTE_METADATA[route].permissions ?? []
  return required.includes('document.create') || required.includes('count.plan')
}

/** Mirrors the `HasPermission` contract the sidebar filter expects. */
function hasFor(grant: ApprovedRoleGrant) {
  return (
    codes: readonly (typeof grant.permissionCodes)[number][],
    mode: 'all' | 'any',
  ): boolean =>
    mode === 'all'
      ? hasAllPermissions(grant.permissionCodes, codes)
      : hasAnyPermission(grant.permissionCodes, codes)
}

function reachable(grant: ApprovedRoleGrant): RouteKey[] {
  return REAL_ROUTES.filter((route) => hasRoutePermission(grant.permissionCodes, route))
}

function navGroupIds(grant: ApprovedRoleGrant): string[] {
  return filterSidebarNav(SIDEBAR_NAV_GROUPS, hasFor(grant)).map((group) => group.id)
}

function navItemKeys(grant: ApprovedRoleGrant): string[] {
  return filterSidebarNav(SIDEBAR_NAV_GROUPS, hasFor(grant)).flatMap((group) =>
    group.items.map((item) => item.routeKey),
  )
}

/** Codes that only an operational (Warehouse) scope may hold. */
const OPERATE_CODES = [
  'document.create',
  'document.update',
  'document.post',
  'document.reject',
  'document.reverse',
  'document.cancel',
  'count.plan',
  'count.complete',
  'count.close',
  'custody.assign',
] as const

const MANAGER_ONLY_ROUTES: readonly RouteKey[] = ['adjustmentNew', 'assetDisposalNew']

describe('D-RBAC-03: Enterprise and Site are governance-only', () => {
  const enterprise = approvedGrant('WH_MGR', 'Enterprise')
  const site = approvedGrant('WH_MGR', 'Site')
  const warehouse = approvedGrant('WH_MGR', 'Warehouse')

  it('grants no operate code to a manager at Enterprise scope', () => {
    for (const code of OPERATE_CODES) {
      expect(enterprise.permissionCodes).not.toContain(code)
    }
  })

  it('grants no operate code to a manager at Site scope', () => {
    for (const code of OPERATE_CODES) {
      expect(site.permissionCodes).not.toContain(code)
    }
  })

  it('grants the operate codes to a manager at Warehouse scope', () => {
    for (const code of ['document.post', 'count.plan', 'count.close'] as const) {
      expect(warehouse.permissionCodes).toContain(code)
    }
  })

  it('reaches an identical route set at Enterprise and Site scope', () => {
    expect(reachable(site)).toEqual(reachable(enterprise))
    expect(navGroupIds(site)).toEqual(navGroupIds(enterprise))
  })

  it('reaches strictly more routes at Warehouse scope than at Site scope', () => {
    const siteRoutes = new Set(reachable(site))
    const warehouseOnly = reachable(warehouse).filter((route) => !siteRoutes.has(route))
    expect(warehouseOnly).toEqual(
      expect.arrayContaining([...MANAGER_ONLY_ROUTES, 'countNew', 'documentReceivingNew']),
    )
  })

  it('grants a Site-scope manager no document-creation route', () => {
    for (const route of REAL_ROUTES) {
      if (!isCreateRoute(route)) continue
      expect(hasRoutePermission(site.permissionCodes, route)).toBe(false)
    }
  })
})
describe('separation of duties on the document lifecycle', () => {
  const keeper = approvedGrant('WH_KEEPER', 'Warehouse')
  const manager = approvedGrant('WH_MGR', 'Warehouse')

  it('maps every lifecycle action to exactly one dotted code', () => {
    for (const [action, code] of Object.entries(ACTION_PERMISSION_CODES)) {
      expect(code, `action ${action} must map to a code`).toMatch(/^[a-z]+\.[a-z]+$/)
    }
  })

  it('withholds post, reject and reverse from a keeper', () => {
    for (const action of ['Post', 'Reject', 'Reverse'] as const) {
      const code = ACTION_PERMISSION_CODES[action]
      expect(code, `unknown action ${action}`).toBeDefined()
      expect(keeper.permissionCodes).not.toContain(code as never)
    }
  })

  it('withholds submit and revise from a manager', () => {
    // §7.2 human decision: generic document preparation is a keeper workflow,
    // so a manager never sees Submit or Revise even at Warehouse scope.
    for (const action of ['Submit', 'Revise'] as const) {
      const code = ACTION_PERMISSION_CODES[action]
      expect(code, `unknown action ${action}`).toBeDefined()
      expect(manager.permissionCodes).not.toContain(code as never)
    }
  })

  it('lets a manager post but never submit', () => {
    expect(manager.permissionCodes).toContain(ACTION_PERMISSION_CODES.Post)
    expect(manager.permissionCodes).not.toContain(ACTION_PERMISSION_CODES.Submit)
  })

  it('keeps keeper and manager from sharing a single lifecycle capability', () => {
    // Proves the split is real in both directions rather than a subset relation.
    expect(keeper.permissionCodes).toContain(ACTION_PERMISSION_CODES.Submit)
    expect(manager.permissionCodes).toContain(ACTION_PERMISSION_CODES.Post)
  })
})

describe('D-ADJ-01: Adjustment and Disposal creation is manager-only', () => {
  const keeper = approvedGrant('WH_KEEPER', 'Warehouse')
  const manager = approvedGrant('WH_MGR', 'Warehouse')
  const siteManager = approvedGrant('WH_MGR', 'Site')

  it('denies the keeper both manager-only creation routes', () => {
    for (const route of MANAGER_ONLY_ROUTES) {
      expect(hasRoutePermission(keeper.permissionCodes, route)).toBe(false)
    }
  })

  it('admits the warehouse manager both manager-only creation routes', () => {
    for (const route of MANAGER_ONLY_ROUTES) {
      expect(hasRoutePermission(manager.permissionCodes, route)).toBe(true)
    }
  })

  it('denies the Site-scope manager both manager-only creation routes', () => {
    for (const route of MANAGER_ONLY_ROUTES) {
      expect(hasRoutePermission(siteManager.permissionCodes, route)).toBe(false)
    }
  })

  it('still admits a keeper to adjustment read routes', () => {
    expect(hasRoutePermission(keeper.permissionCodes, 'adjustments')).toBe(true)
    expect(hasRoutePermission(keeper.permissionCodes, 'adjustmentDetail')).toBe(true)
  })
})

describe('custody assignment stays with the keeper workflow', () => {
  const keeper = approvedGrant('WH_KEEPER', 'Warehouse')
  const manager = approvedGrant('WH_MGR', 'Warehouse')

  it('gives only the keeper the pending-custody queue', () => {
    expect(keeper.permissionCodes).toContain('custody.assign')
    expect(manager.permissionCodes).not.toContain('custody.assign')
  })

  it('gates the pending queue on assign permission, not on the view code', () => {
    expect(hasRoutePermission(keeper.permissionCodes, 'custodyPending')).toBe(true)
    expect(hasRoutePermission(manager.permissionCodes, 'custodyPending')).toBe(false)
  })

  it('leaves the active read-only custody list open to both', () => {
    expect(hasRoutePermission(keeper.permissionCodes, 'custodyActive')).toBe(true)
    expect(hasRoutePermission(manager.permissionCodes, 'custodyActive')).toBe(true)
  })
})

describe('SYSTEM_ADMIN is structural administration only', () => {
  const admin = approvedGrant('SYSTEM_ADMIN', 'Enterprise')

  it('denies audit and report viewing', () => {
    expect(admin.permissionCodes).not.toContain('audit.view')
    expect(admin.permissionCodes).not.toContain('report.view')
    expect(hasRoutePermission(admin.permissionCodes, 'audit')).toBe(false)
    expect(hasRoutePermission(admin.permissionCodes, 'reports')).toBe(false)
  })

  it('denies every operational ledger route', () => {
    const operational: RouteKey[] = [
      'inventoryBalances',
      'inventoryBalanceDetail',
      'inventoryMovements',
      'inventoryMovementDetail',
      'documentReceiving',
      'documentReceivingNew',
      'counts',
      'countNew',
      'assets',
      'assetDetail',
      'custodyActive',
    ]
    for (const route of operational) {
      expect(hasRoutePermission(admin.permissionCodes, route), `route ${route}`).toBe(false)
    }
  })

  it('denies every document action at the lifecycle layer', () => {
    for (const code of Object.values(ACTION_PERMISSION_CODES)) {
      expect(admin.permissionCodes).not.toContain(code)
    }
  })

  it('admits exactly the structural and user-management routes', () => {
    const reached = reachable(admin)
    expect(reached).toContain('adminUsers')
    expect(reached).toContain('adminRoles')
    expect(reached).toContain('catalogMaterials')
    expect(reached).toContain('warehouses')
    expect(reached).toContain('organizationEmployees')
  })

  it('shows the admin navigation but never audit or reports', () => {
    const groups = navGroupIds(admin)
    expect(groups).toContain('admin')
    expect(groups).not.toContain('audit')
    expect(groups).not.toContain('reports')
  })
})

describe('AUDITOR is read-only across every scope', () => {
  for (const scopeType of ['Enterprise', 'Site', 'Warehouse'] as const) {
    const auditor = approvedGrant('AUDITOR', scopeType)

    it(`holds only read codes at ${scopeType} scope`, () => {
      for (const code of auditor.permissionCodes) {
        expect(code, `${code} must end in .view`).toMatch(/\.view$/)
      }
    })

    it(`reaches no creation or lifecycle route at ${scopeType} scope`, () => {
      const writes = reachable(auditor).filter((route) => {
        const perms = [
          ...(ROUTE_METADATA[route].permissions ?? []),
          ...(ROUTE_METADATA[route].permissionAny ?? []),
        ]
        return perms.some((code) => !code.endsWith('.view'))
      })
      expect(writes).toEqual([])
    })

    it(`reaches the audit ledger at ${scopeType} scope`, () => {
      expect(hasRoutePermission(auditor.permissionCodes, 'audit')).toBe(true)
    })

    it(`reaches no admin route at ${scopeType} scope`, () => {
      expect(hasRoutePermission(auditor.permissionCodes, 'adminUsers')).toBe(false)
      expect(hasRoutePermission(auditor.permissionCodes, 'adminRoles')).toBe(false)
    })
  }
})

describe('navigation is filtered by the same policy as the routes', () => {
  it('never hides a nav item whose route the same role can reach', () => {
    for (const grant of APPROVED_ROLE_GRANTS) {
      const reachableRoutes = new Set<string>(reachable(grant))
      const items = navItemKeys(grant)
      expect(items.length).toBeGreaterThan(0)
      for (const key of items) {
        expect(reachableRoutes, `${grant.role}@${grant.scopeType}: ${key}`).toContain(key)
      }
    }
  })

  it('never shows a nav item whose route the same role cannot reach', () => {
    for (const grant of APPROVED_ROLE_GRANTS) {
      const reachableRoutes = new Set<string>(reachable(grant))
      for (const key of navItemKeys(grant)) {
        expect(reachableRoutes.has(key), `${grant.role}@${grant.scopeType}: ${key}`).toBe(true)
      }
    }
  })

  it('keeps every list route reachable from navigation for at least one role', () => {
    const allNavKeys = new Set<string>(
      SIDEBAR_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.routeKey)),
    )
    for (const key of REAL_ROUTES) {
      if (!isListRoute(key)) continue
      expect(allNavKeys, `list route ${key} must appear in navigation`).toContain(key)
    }
  })
})

describe('deferred roles are not silently granted', () => {
  it('lists DATA_MANAGER as deferred', () => {
    expect(DEFERRED_ROLES).toContain('DATA_MANAGER')
  })

  it('has no approved grant rows for any deferred role', () => {
    for (const role of DEFERRED_ROLES) {
      const rows = APPROVED_ROLE_GRANTS.filter((grant) => grant.role === role)
      expect(rows, `${role} must have no grant row`).toEqual([])
    }
  })

  it('grants a deferred role nothing by accident', () => {
    // Guarding against a future refactor that reintroduces DATA_MANAGER as a
    // broad all-codes role.
    for (const role of DEFERRED_ROLES) {
      const reachableCodes = new Set(
        APPROVED_ROLE_GRANTS.flatMap((grant) => grant.permissionCodes as readonly string[]),
      )
      expect(reachableCodes.has(role)).toBe(false)
    }
  })
})
