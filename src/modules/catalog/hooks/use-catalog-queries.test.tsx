import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import {
  wireMaterial,
  wireMaterialCategory,
  wireMaterialDomain,
  wireMaterialFamily,
  wireNamedReference,
  wireUnitOfMeasure,
} from '@/test/msw/catalog-wire-fixtures'
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
    const domain = wireMaterialDomain()
    const category = wireMaterialCategory({
      materialDomain: wireNamedReference(domain.materialDomainId, domain.nameAr),
    })
    const family = wireMaterialFamily({
      materialCategory: wireNamedReference(category.materialCategoryId, category.nameAr),
    })
    const material = wireMaterial({
      materialFamily: wireNamedReference(family.materialFamilyId, family.nameAr),
    })
    const unit = wireUnitOfMeasure()

    server.use(
      http.get(`${API_BASE_URL}/catalog/material-domains`, () => okPageJson([domain])),
      http.get(`${API_BASE_URL}/catalog/material-domains/${domain.materialDomainId}`, () =>
        okJson(domain),
      ),
      http.get(`${API_BASE_URL}/catalog/material-categories`, () => okPageJson([category])),
      http.get(`${API_BASE_URL}/catalog/material-categories/${category.materialCategoryId}`, () =>
        okJson(category),
      ),
      http.get(`${API_BASE_URL}/catalog/material-families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/material-families/${family.materialFamilyId}`, () =>
        okJson(family),
      ),
      http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
      http.get(`${API_BASE_URL}/catalog/materials/${material.materialId}`, () => okJson(material)),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([unit])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure/${unit.unitId}`, () => okJson(unit)),
    )

    const domains = renderHook(() => useMaterialDomainsQuery({ status: 'Active' }), {
      wrapper: createWrapper(),
    })
    const domainDetail = renderHook(() => useMaterialDomainQuery(domain.materialDomainId), {
      wrapper: createWrapper(),
    })
    const categories = renderHook(
      () => useMaterialCategoriesQuery({ domainId: domain.materialDomainId }),
      { wrapper: createWrapper() },
    )
    const categoryDetail = renderHook(() => useMaterialCategoryQuery(category.materialCategoryId), {
      wrapper: createWrapper(),
    })
    const families = renderHook(
      () => useMaterialFamiliesQuery({ categoryId: category.materialCategoryId }),
      { wrapper: createWrapper() },
    )
    const familyDetail = renderHook(() => useMaterialFamilyQuery(family.materialFamilyId), {
      wrapper: createWrapper(),
    })
    const materials = renderHook(() => useMaterialsQuery({ familyId: family.materialFamilyId }), {
      wrapper: createWrapper(),
    })
    const materialDetail = renderHook(() => useMaterialQuery(material.materialId), {
      wrapper: createWrapper(),
    })
    const units = renderHook(() => useUnitsOfMeasureQuery(), { wrapper: createWrapper() })
    const unitDetail = renderHook(() => useUnitOfMeasureQuery(unit.unitId), {
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

    // Every list hook resolves the SERVICE's page (`{ items, meta }`), not a
    // bare array: `requestPage` is the one transport method that answers a
    // normalized page, so the rows live under `items` at every consumer.
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
  })

  it('does not request protected catalog data before a server-selected scope exists', async () => {
    activeScope.key = undefined
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, () => {
        requestCount += 1
        return okPageJson([wireMaterial()])
      }),
    )

    const { result } = renderHook(() => useMaterialsQuery({ search: 'حاسوب' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(result.current.data).toBeUndefined()
    expect(requestCount).toBe(0)
  })
})
