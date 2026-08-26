import { lazy, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react'
import type { RouteObject } from 'react-router'

import { ROUTE_METADATA, ROUTE_PATHS, type RouteKey } from '@/config/routes'
import { DomainErrorBoundary } from '@/shared/layout/domain-error-boundary'

export type LazyPage = LazyExoticComponent<ComponentType>

const routePlaceholderPage = lazy(() => import('@/app/pages/route-placeholder-page'))

/**
 * Keep the component gallery entirely out of production output. Vite replaces
 * this condition at build time, so the gallery's dynamic import is removed
 * instead of merely being hidden from the route list.
 */
const DEV_ONLY_PAGES: Partial<Record<RouteKey, LazyPage>> = import.meta.env.DEV
  ? {
      devGallery: lazy(() => import('@/app/gallery/gallery-page')),
    }
  : {}

/**
 * Wired pages by route key. Each epic appends its delivered pages here; a key
 * without an entry stays unrouted even though ROUTE_PATHS declares it — an
 * unwired route behaves as an unlisted URL (not-found).
 *
 * To wire a page: `key: lazy(() => import('@/modules/<domain>/pages/<page>'))`.
 * The lazy import keeps every page in its own chunk, downloaded only when the
 * route is first visited.
 */
const PAGES: Partial<Record<RouteKey, LazyPage>> = {
  login: lazy(() => import('@/modules/auth/pages/login-page')),
  notFound: lazy(() => import('@/app/pages/not-found-page')),
  dashboard: routePlaceholderPage,
  catalogDomains: lazy(() => import('@/modules/catalog/pages/material-domains-page')),
  catalogCategories: lazy(() => import('@/modules/catalog/pages/material-categories-page')),
  catalogFamilies: lazy(() => import('@/modules/catalog/pages/material-families-page')),
  catalogMaterials: lazy(() => import('@/modules/catalog/pages/materials-list-page')),
  catalogMaterialDetail: lazy(() => import('@/modules/catalog/pages/material-detail-page')),
  catalogUnits: lazy(() => import('@/modules/catalog/pages/units-of-measure-page')),
  organizationSites: lazy(() => import('@/modules/organization/pages/sites-list-page')),
  organizationSiteDetail: lazy(() => import('@/modules/organization/pages/site-detail-page')),
  organizationOrgUnits: lazy(
    () => import('@/modules/organization/pages/organizational-units-page'),
  ),
  organizationEmployees: lazy(() => import('@/modules/organization/pages/employees-list-page')),
  organizationEmployeeDetail: lazy(
    () => import('@/modules/organization/pages/employee-detail-page'),
  ),
  organizationExternalParties: lazy(
    () => import('@/modules/organization/pages/external-parties-page'),
  ),
  warehouses: lazy(() => import('@/modules/warehouse/pages/warehouses-list-page')),
  warehouseDetail: lazy(() => import('@/modules/warehouse/pages/warehouse-detail-page')),
  inventoryBalances: lazy(() => import('@/modules/inventory/pages/inventory-balances-page')),
  inventoryBalanceDetail: lazy(
    () => import('@/modules/inventory/pages/inventory-balance-detail-page'),
  ),
  inventoryMovements: lazy(() => import('@/modules/inventory/pages/stock-movements-page')),
  inventoryMovementDetail: lazy(
    () => import('@/modules/inventory/pages/stock-movement-detail-page'),
  ),
  documentReceiving: lazy(() => import('@/modules/receiving/pages/receiving-documents-list-page')),
  documentReceivingNew: lazy(
    () => import('@/modules/receiving/pages/receiving-document-form-page'),
  ),
  documentReceivingDetail: lazy(
    () => import('@/modules/receiving/pages/receiving-document-detail-page'),
  ),
  documentIssue: lazy(() => import('@/modules/issue/pages/issue-documents-list-page')),
  documentIssueNew: lazy(() => import('@/modules/issue/pages/issue-document-form-page')),
  documentIssueDetail: lazy(() => import('@/modules/issue/pages/issue-document-detail-page')),
  documentTransfer: lazy(() => import('@/shared/documents/pages/document-list-page')),
  documentTransferNew: lazy(() => import('@/modules/transfer/pages/transfer-document-form-page')),
  documentTransferDetail: lazy(
    () => import('@/modules/transfer/pages/transfer-document-detail-page'),
  ),
  documentOpening: lazy(() => import('@/modules/opening/pages/opening-documents-list-page')),
  documentOpeningNew: lazy(() => import('@/modules/opening/pages/opening-document-form-page')),
  documentOpeningDetail: lazy(() => import('@/shared/documents/pages/document-detail-page')),
  documentReturn: lazy(() => import('@/shared/documents/pages/document-list-page')),
  documentReturnNew: lazy(() => import('@/modules/custody/pages/return-document-form-page')),
  documentReturnDetail: lazy(() => import('@/modules/custody/pages/return-document-detail-page')),
  adjustments: lazy(() => import('@/modules/adjustment/pages/adjustments-list-page')),
  adjustmentNew: lazy(() => import('@/modules/adjustment/pages/adjustment-draft-form-page')),
  adjustmentDetail: routePlaceholderPage,
  counts: lazy(() => import('@/modules/inventory-count/pages/inventory-count-list-page')),
  countNew: lazy(() => import('@/modules/inventory-count/pages/count-planning-form-page')),
  countDetail: lazy(() => import('@/modules/inventory-count/pages/count-detail-page')),
  assets: lazy(() => import('@/modules/asset/pages/asset-registry-list-page')),
  assetDetail: lazy(() => import('@/modules/asset/pages/asset-detail-page')),
  assetCustodyHistory: lazy(() => import('@/modules/asset/pages/asset-custody-history-page')),
  custodyPending: lazy(() => import('@/modules/custody/pages/pending-custody-list-page')),
  custodyActive: lazy(() => import('@/modules/custody/pages/active-custody-list-page')),
  custodyDetail: lazy(() => import('@/modules/custody/pages/custody-detail-page')),
  audit: routePlaceholderPage,
  reports: routePlaceholderPage,
  adminUsers: routePlaceholderPage,
  adminUserDetail: routePlaceholderPage,
  adminRoles: routePlaceholderPage,
  adminRoleDetail: routePlaceholderPage,
  ...DEV_ONLY_PAGES,
}

/**
 * Dev-only surface — stripped from production builds by the router when it
 * skips `devOnly` metadata (import.meta.env.DEV is statically replaced).
 */
export function isDevOnlyRoute(key: RouteKey): boolean {
  return ROUTE_METADATA[key].devOnly === true
}

export function hasWiredPage(key: RouteKey): boolean {
  return key in PAGES
}

export function getWiredPage(key: RouteKey): LazyPage {
  const page = PAGES[key]
  if (!page) {
    throw new Error(
      `Route "${key}" is not wired yet — deliver the page in its epic before enabling it.`,
    )
  }
  return page
}

export function getWiredRouteKeys(): RouteKey[] {
  return (Object.keys(PAGES) as RouteKey[]).filter(
    (key) => !isDevOnlyRoute(key) || import.meta.env.DEV,
  )
}

/**
 * Builds the element for a wired route key. Use inside route objects that the
 * app router composes (see @/app/app-router).
 */
export function createLazyPageElement(key: RouteKey): ReactElement {
  const Page = getWiredPage(key)
  return <Page />
}

/**
 * Route element wrapped in the per-domain error boundary (e05-t07): a crash
 * inside one page surfaces the Arabic ErrorState and clears on navigation.
 */
function createBoundaryElement(key: RouteKey): ReactElement {
  return <DomainErrorBoundary>{createLazyPageElement(key)}</DomainErrorBoundary>
}

export function toRouteObject(key: RouteKey): RouteObject {
  return { path: ROUTE_PATHS[key], element: createBoundaryElement(key) }
}

export function toCatchAllRouteObject(key: RouteKey): RouteObject {
  return { path: '*', element: createBoundaryElement(key) }
}
