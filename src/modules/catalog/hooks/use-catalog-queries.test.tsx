import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { fixtureUuid } from '@/test/msw/factories'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  catalogQueryKeys,
  useMaterialCategoriesQuery,
  useMaterialCategoryQuery,
  useMaterialDomainQuery,
  useMaterialDomainsQuery,
  useMaterialFamiliesQuery,
  useMaterialFamilyQuery,
  useMaterialQuery,
  useMaterialsQuery,
  useUnitOfMeasureQuery,
  useUnitsOfMeasureQuery,
} from './use-catalog-queries'

const API_BASE_URL = '/api/v1'

// Records in the REAL wire shape: `id` identifiers, `name` labels, no nested
// reference objects, and no `rowVersion` anywhere. The shared wire fixtures were
// still minting the generated snapshot's records, and a fixture the API could
// never produce is what lets a suite pass against the wrong contract.
const DOMAIN_ID = fixtureUuid(20)
const CATEGORY_ID = fixtureUuid(21)
const FAMILY_ID = fixtureUuid(22)
const UNIT_ID = fixtureUuid(23)
const MATERIAL_ID = fixtureUuid(24)

function makeDomain() {
  return {
    id: DOMAIN_ID,
    name: 'تقنية المعلومات',
    code: 'IT',
    status: 'Active' as const,
  }
}

function makeCategory() {
  return {
    id: CATEGORY_ID,
    materialDomainId: DOMAIN_ID,
    parentCategoryId: null,
    name: 'الأجهزة',
    code: 'IT-HW',
    status: 'Active' as const,
  }
}

function makeFamily() {
  return {
    id: FAMILY_ID,
    categoryId: CATEGORY_ID,
    name: 'الحواسيب',
    code: 'IT-HW-PC',
    status: 'Active' as const,
  }
}

function makeMaterial() {
  return {
    id: MATERIAL_ID,
    familyId: FAMILY_ID,
    nameAr: 'حاسوب مكتبي',
    nameEn: null,
    code: 'IT-HW-PC-001',
    materialKind: 'Consumable' as const,
    trackingType: 'Quantity' as const,
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Active' as const,
    materialDomainId: DOMAIN_ID,
    materialDomainName: 'تقنية المعلومات',
    baseUnitId: UNIT_ID,
    baseUnitSymbol: 'EA',
  }
}

function makeUnit() {
  return {
    id: UNIT_ID,
    name: 'قطعة',
    symbol: 'EA',
    unitType: 'Quantity',
    status: 'Active' as const,
  }
}

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('catalog query hooks', () => {
  it('uses scope-isolated keys for catalog lists and details', () => {
    const scope = { kind: 'enterprise' as const }
    const query = { status: 'Active' as const }

    // The prefix is `scoped` + the active scope's kind and id, so every catalog
    // entry is reachable through `invalidateScopedQueries` / `clearScopedQueries`.
    // The segment AFTER `catalog` is the module's own cache namespace
    // (`materialDomains`), not a wire contract: the endpoint spelling lives in
    // the service, and no other module's key is readable from it.
    expect(catalogQueryKeys.materialDomains(scope, query)).toEqual([
      'scoped',
      'enterprise',
      null,
      'catalog',
      'materialDomains',
      query,
    ])
    expect(catalogQueryKeys.material(scope, 'material-1')).toEqual([
      'scoped',
      'enterprise',
      null,
      'catalog',
      'materials',
      'material-1',
    ])
  })

  it('reads all catalog references and material resources through scoped master-data queries', async () => {
    const domain = makeDomain()
    const category = makeCategory()
    const family = makeFamily()
    const material = makeMaterial()
    const unit = makeUnit()

    server.use(
      // The REAL collections are `/catalog/domains`, `/catalog/categories` and
      // `/catalog/families`. The retired `/catalog/material-domains`,
      // `/catalog/material-categories` and `/catalog/material-families` spellings
      // answer 404, so a handler registered under one of them would certify a
      // route the backend does not serve.
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([domain])),
      http.get(`${API_BASE_URL}/catalog/domains/${domain.id}`, () => okJson(domain)),
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
      http.get(`${API_BASE_URL}/catalog/categories/${category.id}`, () => okJson(category)),
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/families/${family.id}`, () => okJson(family)),
      http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
      http.get(`${API_BASE_URL}/catalog/materials/${material.id}`, () => okJson(material)),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([unit])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure/${unit.id}`, () => okJson(unit)),
    )

    const domains = renderHook(() => useMaterialDomainsQuery({ status: 'Active' }), {
      wrapper: createWrapper(),
    })
    const domainDetail = renderHook(() => useMaterialDomainQuery(domain.id), {
      wrapper: createWrapper(),
    })
    const categories = renderHook(
      () => useMaterialCategoriesQuery({ materialDomainId: domain.id }),
      { wrapper: createWrapper() },
    )
    const categoryDetail = renderHook(() => useMaterialCategoryQuery(category.id), {
      wrapper: createWrapper(),
    })
    const families = renderHook(() => useMaterialFamiliesQuery({ categoryId: category.id }), {
      wrapper: createWrapper(),
    })
    const familyDetail = renderHook(() => useMaterialFamilyQuery(family.id), {
      wrapper: createWrapper(),
    })
    const materials = renderHook(() => useMaterialsQuery({ familyId: family.id }), {
      wrapper: createWrapper(),
    })
    const materialDetail = renderHook(() => useMaterialQuery(material.id), {
      wrapper: createWrapper(),
    })
    const units = renderHook(() => useUnitsOfMeasureQuery(), { wrapper: createWrapper() })
    const unitDetail = renderHook(() => useUnitOfMeasureQuery(unit.id), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(domains.result.current.isSuccess).toBe(true)
      expect(domainDetail.result.current.isSuccess).toBe(true)
      expect(categories.result.current.isSuccess).toBe(true)
      expect(categoryDetail.result.current.isSuccess).toBe(true)
      expect(families.result.current.isSuccess).toBe(true)
      expect(familyDetail.result.current.isSuccess).toBe(true)
      expect(materials.result.current.isSuccess).toBe(true)
      expect(materialDetail.result.current.isSuccess).toBe(true)
      expect(units.result.current.isSuccess).toBe(true)
      expect(unitDetail.result.current.isSuccess).toBe(true)
    })

    // Every list hook resolves the SERVICE's `ApiPage<T>` — the shared
    // one-based page, not a module-local `PageMeta` wrapper — so the rows live
    // under `items` at every consumer and the totals live on the page.
    expect(domains.result.current.data?.items).toEqual([domain])
    expect(domainDetail.result.current.data).toEqual(domain)
    expect(categories.result.current.data?.items).toEqual([category])
    expect(categoryDetail.result.current.data).toEqual(category)
    expect(families.result.current.data?.items).toEqual([family])
    expect(familyDetail.result.current.data).toEqual(family)
    expect(materials.result.current.data?.items).toEqual([material])
    expect(materialDetail.result.current.data).toEqual(material)
    expect(units.result.current.data?.items).toEqual([unit])
    expect(unitDetail.result.current.data).toEqual(unit)
    expect(domains.result.current.data?.page).toBe(1)
    expect(domains.result.current.data?.totalItems).toBe(1)
  })

  it('does not request protected catalog data before a server-selected scope exists', async () => {
    activeScope.key = undefined
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, () => {
        requestCount += 1
        return okPageJson([makeMaterial()])
      }),
    )

    // No `search`: no catalog list binds one, so the filter the old code sent
    // was fiction the server silently ignored.
    const { result } = renderHook(() => useMaterialsQuery({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(result.current.data).toBeUndefined()
    expect(requestCount).toBe(0)
  })

  it('forwards a one-based page to the wire without subtracting one', async () => {
    const requestedUrls: string[] = []
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        requestedUrls.push(request.url)
        return okPageJson([])
      }),
    )

    const { result } = renderHook(() => useMaterialsQuery({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(requestedUrls[0]).toContain('page=1')
    expect(requestedUrls[0]).not.toContain('page=0')
  })
})
