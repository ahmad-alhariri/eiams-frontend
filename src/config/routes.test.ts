import { describe, expect, it } from 'vitest'

import { isPermissionCode } from '@/config/permissions'
import { ROUTE_METADATA, ROUTE_PATHS, type RouteKey } from '@/config/routes'

const ARABIC_PATTERN = /[\u0600-\u06FF]/

function allKeys(): RouteKey[] {
  return Object.keys(ROUTE_PATHS) as RouteKey[]
}

describe('Route constants (D-RBAC-01)', () => {
  it('declares every matrix group route with metadata', () => {
    const keys = allKeys()
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(ROUTE_METADATA[key], `missing metadata for ${key}`).toBeDefined()
    }
  })

  it('keeps every path unique', () => {
    const paths = Object.values(ROUTE_PATHS)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('gives every route an Arabic label', () => {
    for (const key of allKeys()) {
      expect(ARABIC_PATTERN.test(ROUTE_METADATA[key].labelAr), `${key} label must be Arabic`).toBe(
        true,
      )
    }
  })

  it('requires guard metadata on every non-public route', () => {
    for (const key of allKeys()) {
      const meta = ROUTE_METADATA[key]
      if (meta.public) {
        continue
      }
      expect(
        meta.permissions || meta.permissionAny,
        `${key} is protected and must declare permissions or permissionAny`,
      ).toBeDefined()
      expect(meta.permissions?.length || meta.permissionAny?.length || 0).toBeGreaterThan(0)
    }
  })

  it('uses only codes from the PermissionCode vocabulary', () => {
    for (const key of allKeys()) {
      const meta = ROUTE_METADATA[key]
      for (const code of [...(meta.permissions ?? []), ...(meta.permissionAny ?? [])]) {
        expect(isPermissionCode(code), `${key} uses unknown code ${code}`).toBe(true)
      }
    }
  })

  it('marks the dev gallery as dev-only and auth routes as public', () => {
    expect(ROUTE_METADATA.devGallery.devOnly).toBe(true)
    expect(ROUTE_METADATA.login.public).toBe(true)
    expect(ROUTE_METADATA.scopeSelect.public).toBe(true)
    expect(ROUTE_METADATA.noAccess.public).toBe(true)
    expect(ROUTE_METADATA.notFound.public).toBe(true)
  })

  it('guards the dashboard behind "any operational view" semantics', () => {
    const dashboard = ROUTE_METADATA.dashboard
    expect(dashboard.permissionAny).toContain('catalog.view')
    expect(dashboard.permissionAny).toContain('inventory.view')
    expect(dashboard.permissionAny).toContain('report.view')
  })

  it('keeps breadcrumb parents inside the route set', () => {
    const keys = new Set(allKeys())
    for (const key of allKeys()) {
      const parent = ROUTE_METADATA[key].parent
      if (parent) {
        expect(keys.has(parent), `${key} parent ${parent} must be a declared route`).toBe(true)
      }
    }
  })

  it('declares document create variants with create+view guards', () => {
    const newRoutes = [
      ROUTE_METADATA.documentReceivingNew,
      ROUTE_METADATA.documentIssueNew,
      ROUTE_METADATA.documentTransferNew,
      ROUTE_METADATA.documentOpeningNew,
      ROUTE_METADATA.documentReturnNew,
      ROUTE_METADATA.adjustmentNew,
    ]
    for (const meta of newRoutes) {
      expect(meta.permissions).toContain('document.view')
      expect(meta.permissions).toContain('document.create')
    }
  })

  it('guards count planning with count.view + count.plan', () => {
    expect(ROUTE_METADATA.countNew.permissions).toEqual(['count.view', 'count.plan'])
    expect(ROUTE_METADATA.counts.permissions).toEqual(['count.view'])
  })

  it('guards inventory read routes with inventory.view only', () => {
    expect(ROUTE_METADATA.inventoryBalances.permissions).toEqual(['inventory.view'])
    expect(ROUTE_METADATA.inventoryBalanceDetail.permissions).toEqual(['inventory.view'])
    expect(ROUTE_METADATA.inventoryBalanceDetail.parent).toBe('inventoryBalances')
    expect(ROUTE_PATHS.inventoryBalanceDetail).toBe('/inventory/balances/:balanceId')
    expect(ROUTE_METADATA.inventoryMovements.permissions).toEqual(['inventory.view'])
    expect(ROUTE_METADATA.inventoryMovementDetail.permissions).toEqual(['inventory.view'])
    expect(ROUTE_METADATA.inventoryMovementDetail.parent).toBe('inventoryMovements')
    expect(ROUTE_PATHS.inventoryMovementDetail).toBe('/inventory/movements/:movementId')
  })
})
