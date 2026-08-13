import type { Icon } from '@tabler/icons-react'
import {
  IconAdjustmentsHorizontal,
  IconArchive,
  IconArrowsUpDown,
  IconArrowLeftRight,
  IconBox,
  IconBuilding,
  IconBuildingWarehouse,
  IconCategory2,
  IconChartBar,
  IconClipboardList,
  IconFiles,
  IconHierarchy2,
  IconHistory,
  IconLayoutDashboard,
  IconMapPin,
  IconPackageImport,
  IconPackageExport,
  IconRotateClockwise,
  IconRuler2,
  IconScale,
  IconShieldCheck,
  IconTags,
  IconUserCheck,
  IconUserCog,
  IconUserShare,
  IconUsers,
} from '@tabler/icons-react'

import type { PermissionCode } from '@/config/permissions'
import { ROUTE_METADATA, ROUTE_PATHS, type RouteKey } from '@/config/routes'

export type HasPermission = (codes: readonly PermissionCode[], mode: 'all' | 'any') => boolean

export interface SidebarNavItem {
  routeKey: RouteKey
  icon: Icon
}

export interface SidebarNavGroup {
  id: string
  labelAr: string
  items: SidebarNavItem[]
}

/**
 * Sidebar navigation model — every item is a route key in ROUTE_PATHS, so
 * guard metadata and Arabic labels always come from the single D-RBAC-01
 * source (config/routes.ts). Detail routes (/new, /:id) are breadcrumb-level
 * and intentionally absent here. Only list-page keys with guards appear.
 */
export const SIDEBAR_NAV_GROUPS: readonly SidebarNavGroup[] = [
  {
    id: 'dashboard',
    labelAr: 'الرئيسية',
    items: [{ routeKey: 'dashboard', icon: IconLayoutDashboard }],
  },
  {
    id: 'catalog',
    labelAr: 'التصنيف والأصناف',
    items: [
      { routeKey: 'catalogDomains', icon: IconHierarchy2 },
      { routeKey: 'catalogCategories', icon: IconCategory2 },
      { routeKey: 'catalogFamilies', icon: IconTags },
      { routeKey: 'catalogMaterials', icon: IconBox },
      { routeKey: 'catalogUnits', icon: IconRuler2 },
    ],
  },
  {
    id: 'organization',
    labelAr: 'المؤسسة',
    items: [
      { routeKey: 'organizationSites', icon: IconMapPin },
      { routeKey: 'organizationOrgUnits', icon: IconBuilding },
      { routeKey: 'organizationEmployees', icon: IconUsers },
      { routeKey: 'organizationExternalParties', icon: IconUserShare },
    ],
  },
  {
    id: 'warehouses',
    labelAr: 'المستودعات',
    items: [{ routeKey: 'warehouses', icon: IconBuildingWarehouse }],
  },
  {
    id: 'inventory',
    labelAr: 'المخزون',
    items: [
      { routeKey: 'inventoryBalances', icon: IconScale },
      { routeKey: 'inventoryMovements', icon: IconArrowsUpDown },
    ],
  },
  {
    id: 'documents',
    labelAr: 'المستندات',
    items: [
      { routeKey: 'documentReceiving', icon: IconPackageImport },
      { routeKey: 'documentIssue', icon: IconPackageExport },
      { routeKey: 'documentTransfer', icon: IconArrowLeftRight },
      { routeKey: 'documentOpening', icon: IconFiles },
      { routeKey: 'documentReturn', icon: IconRotateClockwise },
    ],
  },
  {
    id: 'adjustments',
    labelAr: 'التسويات',
    items: [{ routeKey: 'adjustments', icon: IconAdjustmentsHorizontal }],
  },
  {
    id: 'counts',
    labelAr: 'الجرد الدوري',
    items: [{ routeKey: 'counts', icon: IconClipboardList }],
  },
  {
    id: 'assets-custody',
    labelAr: 'الأصول والتكليف',
    items: [
      { routeKey: 'assets', icon: IconArchive },
      { routeKey: 'custodyPending', icon: IconUserCheck },
    ],
  },
  {
    id: 'audit',
    labelAr: 'التدقيق',
    items: [{ routeKey: 'audit', icon: IconHistory }],
  },
  {
    id: 'reports',
    labelAr: 'التقارير',
    items: [{ routeKey: 'reports', icon: IconChartBar }],
  },
  {
    id: 'admin',
    labelAr: 'الإدارة',
    items: [
      { routeKey: 'adminUsers', icon: IconUserCog },
      { routeKey: 'adminRoles', icon: IconShieldCheck },
    ],
  },
]

/** Guard metadata for an item, lifted straight from the route table. */
export function getNavItemGuards(item: SidebarNavItem): {
  permissions: readonly PermissionCode[]
  permissionAny: readonly PermissionCode[]
} {
  const { permissions = [], permissionAny = [] } = ROUTE_METADATA[item.routeKey]
  return { permissions, permissionAny }
}

export function getNavItemPath(item: SidebarNavItem): string {
  return ROUTE_PATHS[item.routeKey]
}

export function getNavItemLabel(item: SidebarNavItem): string {
  return ROUTE_METADATA[item.routeKey].labelAr
}

export const SIDEBAR_NAV_GROUP_IDS = SIDEBAR_NAV_GROUPS.map((group) => group.id)
export const SIDEBAR_NAV_ITEM_COUNT = SIDEBAR_NAV_GROUPS.reduce(
  (sum, group) => sum + group.items.length,
  0,
)

/**
 * Guards an item with its route metadata. e06-t06 owns the real permission
 * source (PermissionContext/'usePermission'); until then the caller supplies
 * the predicate (default grants the full v1 surface).
 */
function guardItem(item: SidebarNavItem, hasPermission: HasPermission): boolean {
  const { permissions, permissionAny } = getNavItemGuards(item)
  if (permissions.length > 0 && !hasPermission(permissions, 'all')) {
    return false
  }
  if (permissionAny.length > 0 && !hasPermission(permissionAny, 'any')) {
    return false
  }
  return true
}

/**
 * Items filtered by guard metadata only — a group is hidden entirely when the
 * session holds none of its items' permissions.
 */
export function filterSidebarNav(
  groups: readonly SidebarNavGroup[],
  hasPermission: HasPermission,
): SidebarNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => guardItem(item, hasPermission)),
    }))
    .filter((group) => group.items.length > 0)
}
