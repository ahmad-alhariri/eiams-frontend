import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import {
  createMaterial,
  createMaterialCategory,
  createMaterialDomain,
  createMaterialFamily,
  createPage,
  createUnitOfMeasure,
} from '@/test/msw/factories'
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

    expect(catalogQueryKeys.materialDomains(scope, query)).toEqual([
      'scoped',
      'enterprise',
      null,
      'catalog',
      'material-domains',
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
    const domain = createMaterialDomain()
    const category = createMaterialCategory()
    const family = createMaterialFamily()
    const material = createMaterial()
    const unit = createUnitOfMeasure()

    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, () => HttpResponse.json([domain])),
      http.get(`${API_BASE_URL}/catalog/domains/${domain.domainId}`, () =>
        HttpResponse.json(domain),
      ),
      http.get(`${API_BASE_URL}/catalog/categories`, () => HttpResponse.json([category])),
      http.get(`${API_BASE_URL}/catalog/categories/${category.categoryId}`, () =>
        HttpResponse.json(category),
      ),
      http.get(`${API_BASE_URL}/catalog/families`, () => HttpResponse.json([family])),
      http.get(`${API_BASE_URL}/catalog/families/${family.familyId}`, () =>
        HttpResponse.json(family),
      ),
      http.get(`${API_BASE_URL}/catalog/materials`, () =>
        HttpResponse.json(createPage([material])),
      ),
      http.get(`${API_BASE_URL}/catalog/materials/${material.materialId}`, () =>
        HttpResponse.json(material),
      ),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => HttpResponse.json([unit])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure/${unit.unitId}`, () =>
        HttpResponse.json(unit),
      ),
    )

    const domains = renderHook(() => useMaterialDomainsQuery({ status: 'Active' }), {
      wrapper: createWrapper(),
    })
    const domainDetail = renderHook(() => useMaterialDomainQuery(domain.domainId), {
      wrapper: createWrapper(),
    })
    const categories = renderHook(() => useMaterialCategoriesQuery({ domainId: domain.domainId }), {
      wrapper: createWrapper(),
    })
    const categoryDetail = renderHook(() => useMaterialCategoryQuery(category.categoryId), {
      wrapper: createWrapper(),
    })
    const families = renderHook(
      () => useMaterialFamiliesQuery({ categoryId: category.categoryId }),
      {
        wrapper: createWrapper(),
      },
    )
    const familyDetail = renderHook(() => useMaterialFamilyQuery(family.familyId), {
      wrapper: createWrapper(),
    })
    const materials = renderHook(() => useMaterialsQuery({ familyId: family.familyId }), {
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

    expect(domains.result.current.data).toEqual([domain])
    expect(categories.result.current.data).toEqual([category])
    expect(families.result.current.data).toEqual([family])
    expect(materials.result.current.data?.items).toEqual([material])
    expect(units.result.current.data).toEqual([unit])
  })

  it('does not request protected catalog data before a server-selected scope exists', async () => {
    activeScope.key = undefined
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, () => {
        requestCount += 1
        return HttpResponse.json(createPage([createMaterial()]))
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
