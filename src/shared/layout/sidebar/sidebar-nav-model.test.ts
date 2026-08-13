import { describe, expect, it } from 'vitest'

import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import {
  filterSidebarNav,
  getNavItemGuards,
  getNavItemLabel,
  getNavItemPath,
  SIDEBAR_NAV_GROUPS,
  SIDEBAR_NAV_GROUP_IDS,
  SIDEBAR_NAV_ITEM_COUNT,
} from '@/shared/layout/sidebar/sidebar-nav-model'

const ALLOW_ALL = () => true
const DENY_ALL = () => false

describe('Sidebar nav model', () => {
  it('exposes 12 groups and 26 items', () => {
    expect(SIDEBAR_NAV_GROUPS).toHaveLength(12)
    expect(SIDEBAR_NAV_ITEM_COUNT).toBe(26)
    expect(SIDEBAR_NAV_GROUP_IDS).toHaveLength(12)
  })

  it('references only declared list routes and resolves their labels from the route table', () => {
    for (const group of SIDEBAR_NAV_GROUPS) {
      for (const item of group.items) {
        expect(ROUTE_PATHS, `unknown route ${item.routeKey}`).toHaveProperty(item.routeKey)
        const meta = ROUTE_METADATA[item.routeKey]
        expect(getNavItemLabel(item), `Arabic label for ${item.routeKey}`).toBe(meta.labelAr)
        expect(getNavItemLabel(item)).toMatch(/[\u0600-\u06FF]/)
        expect(getNavItemPath(item)).toBe(ROUTE_PATHS[item.routeKey])
        expect(item.icon).toBeDefined()
      }
    }
  })

  it('does not duplicate route entries across navigation groups', () => {
    const keys = SIDEBAR_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.routeKey))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('never links create/detail variants in the sidebar', () => {
    const keys = SIDEBAR_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.routeKey))
    expect(keys.some((key) => ROUTE_PATHS[key].endsWith('/new'))).toBe(false)
    expect(keys.some((key) => ROUTE_PATHS[key].includes('/:'))).toBe(false)
  })

  it('lifts guard metadata from the route table for every item', () => {
    for (const group of SIDEBAR_NAV_GROUPS) {
      for (const item of group.items) {
        const guards = getNavItemGuards(item)
        expect(guards.permissions.length + guards.permissionAny.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('filterSidebarNav', () => {
  it('keeps everything when all permissions are granted', () => {
    const filtered = filterSidebarNav(SIDEBAR_NAV_GROUPS, ALLOW_ALL)
    expect(filtered).toHaveLength(12)
    expect(filtered.reduce((sum, g) => sum + g.items.length, 0)).toBe(26)
  })

  it('requires every listed code for "all" mode', () => {
    const grants = new Set(['document.view'])
    const hasPermission = (codes: readonly string[], mode: 'all' | 'any') =>
      mode === 'all'
        ? codes.every((code) => grants.has(code))
        : codes.some((code) => grants.has(code))

    const filtered = filterSidebarNav(SIDEBAR_NAV_GROUPS, hasPermission)
    const documentGroup = filtered.find((g) => g.id === 'documents')
    expect(documentGroup?.items.map((i) => i.routeKey)).toEqual([
      'documentReceiving',
      'documentIssue',
      'documentTransfer',
      'documentOpening',
      'documentReturn',
    ])
  })

  it('satisfies "any" mode with a single granted code', () => {
    const hasPermission = (codes: readonly string[]) =>
      codes.some((code) => code === 'inventory.view')

    const filtered = filterSidebarNav(SIDEBAR_NAV_GROUPS, hasPermission)
    expect(filtered.some((g) => g.id === 'inventory')).toBe(true)
    const countGroup = filtered.find((g) => g.id === 'counts')
    expect(countGroup).toBeUndefined()
  })

  it('hides groups whose items are all denied', () => {
    const filtered = filterSidebarNav(SIDEBAR_NAV_GROUPS, DENY_ALL)
    expect(filtered).toHaveLength(0)
  })
})
