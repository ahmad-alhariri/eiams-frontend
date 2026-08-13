import { lazy, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react'
import type { RouteObject } from 'react-router'

import { ROUTE_METADATA, ROUTE_PATHS, type RouteKey } from '@/config/routes'
import { DomainErrorBoundary } from '@/shared/layout/domain-error-boundary'

export type LazyPage = LazyExoticComponent<ComponentType>

const notFoundPage = lazy(() => import('@/app/pages/not-found-page'))
const loginPage = lazy(() => import('@/modules/auth/pages/login-page'))
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
 */
const PAGES: Partial<Record<RouteKey, LazyPage>> = {
  login: loginPage,
  notFound: notFoundPage,
  dashboard: routePlaceholderPage,
  catalogDomains: routePlaceholderPage,
  catalogCategories: routePlaceholderPage,
  catalogFamilies: routePlaceholderPage,
  catalogMaterials: routePlaceholderPage,
  catalogUnits: routePlaceholderPage,
  organizationSites: routePlaceholderPage,
  organizationOrgUnits: routePlaceholderPage,
  organizationEmployees: routePlaceholderPage,
  organizationExternalParties: routePlaceholderPage,
  warehouses: routePlaceholderPage,
  inventoryBalances: routePlaceholderPage,
  inventoryMovements: routePlaceholderPage,
  documentReceiving: routePlaceholderPage,
  documentReceivingNew: routePlaceholderPage,
  documentReceivingDetail: routePlaceholderPage,
  documentIssue: routePlaceholderPage,
  documentIssueNew: routePlaceholderPage,
  documentIssueDetail: routePlaceholderPage,
  documentTransfer: routePlaceholderPage,
  documentTransferNew: routePlaceholderPage,
  documentTransferDetail: routePlaceholderPage,
  documentOpening: routePlaceholderPage,
  documentOpeningNew: routePlaceholderPage,
  documentOpeningDetail: routePlaceholderPage,
  documentReturn: routePlaceholderPage,
  documentReturnNew: routePlaceholderPage,
  documentReturnDetail: routePlaceholderPage,
  adjustments: routePlaceholderPage,
  adjustmentNew: routePlaceholderPage,
  adjustmentDetail: routePlaceholderPage,
  counts: routePlaceholderPage,
  countNew: routePlaceholderPage,
  countDetail: routePlaceholderPage,
  assets: routePlaceholderPage,
  assetDetail: routePlaceholderPage,
  custodyPending: routePlaceholderPage,
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
export const DEV_ONLY_ROUTE_KEYS: readonly RouteKey[] = ['devGallery']

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
    (key) => !DEV_ONLY_ROUTE_KEYS.includes(key) || import.meta.env.DEV,
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
