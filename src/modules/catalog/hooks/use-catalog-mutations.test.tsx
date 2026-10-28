import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { catalogQueryKeys } from '@/modules/catalog/hooks/use-catalog-queries'
import { createQueryClient } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'
import { errJson, okJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

// A 409 is answered by the recovery dialog and by NOTHING else. Asserting the
// toast manager was never called is how that stays true.
vi.mock('@/shared/ui/toast-manager', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  },
}))

import { toast } from '@/shared/ui/toast-manager'

import {
  MATERIAL_UPDATE_CONFLICT_COPY,
  useCreateMaterialDomainMutation,
  useMaterialUpdateWithConflict,
  useSetMaterialDomainStatusMutation,
  useUpdateMaterialMutation,
} from './use-catalog-mutations'

const API_BASE_URL = '/api/v1'

const DOMAIN_ID = '00000000-0000-4000-8000-000000000020'
const MATERIAL_ID = '00000000-0000-4000-8000-000000000024'
const MATERIAL_CATALOG_VERSION = 3

// The catalog wire fixtures are typed against the real `catalog.api-types`
// contract, so a record mocked here is the record the API serves: `id`
// identifiers, `name` labels, and a `catalogVersion` that no other catalog
// entity carries.
function makeDomain() {
  return { id: DOMAIN_ID, name: 'تقنية المعلومات', code: 'IT', status: 'Active' as const }
}

function makeMaterial() {
  return {
    id: MATERIAL_ID,
    familyId: '00000000-0000-4000-8000-000000000022',
    nameAr: 'حاسوب مكتبي',
    nameEn: null,
    code: 'IT-HW-PC-001',
    materialKind: 'Consumable' as const,
    trackingType: 'Quantity' as const,
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: MATERIAL_CATALOG_VERSION,
    attributes: null,
    status: 'Active' as const,
    materialDomainId: DOMAIN_ID,
    materialDomainName: 'تقنية المعلومات',
    baseUnitId: '00000000-0000-4000-8000-000000000023',
    baseUnitSymbol: 'EA',
  }
}

const MATERIAL_REQUEST = {
  nameAr: 'حاسوب محمول',
  nameEn: null,
  materialKind: 'Asset' as const,
  trackingType: 'Serial' as const,
  hasExpiry: true,
  attributes: '{"serial":"ABC"}',
  expectedCatalogVersion: MATERIAL_CATALOG_VERSION,
}

describe('catalog mutation hooks', () => {
  it('invalidates every affected catalog hierarchy key while preserving other scoped resources', async () => {
    const client = createQueryClient()
    const scope = { kind: 'enterprise' as const }
    const domain = makeDomain()
    const catalogListKey = catalogQueryKeys.materialDomains(scope, {})
    const materialKey = catalogQueryKeys.material(scope, 'material-1')
    const organizationKey = queryKeys.scoped(scope, 'organization', 'sites')
    client.setQueryData(catalogListKey, { items: [], meta: {} })
    client.setQueryData(materialKey, {})
    client.setQueryData(organizationKey, [])

    server.use(http.post(`${API_BASE_URL}/catalog/domains`, () => okJson({ id: domain.id })))

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useCreateMaterialDomainMutation(), {
      wrapper: QueryWrapper,
    })

    // `POST /catalog/domains` binds `name` and `code` only: no `status` (Active by
    // definition) and no version token — MaterialDomain is not versioned.
    await result.current.mutateAsync({ name: domain.name, code: domain.code })

    await waitFor(() => {
      expect(client.getQueryState(catalogListKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(materialKey)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(organizationKey)?.isInvalidated).toBe(false)
  })

  it('sends an integer status command body for a domain', async () => {
    const client = createQueryClient()
    const domain = makeDomain()
    const statusBodies: unknown[] = []

    server.use(
      http.put(`${API_BASE_URL}/catalog/domains/${domain.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useSetMaterialDomainStatusMutation(), {
      wrapper: QueryWrapper,
    })

    await result.current.mutateAsync({ domainId: domain.id, status: 'Inactive' })

    // `[JsonRequired] int Status`: the ORDINAL, never the status name the read
    // served. `{"status":"Inactive"}` is a JSON binding failure (400).
    expect(statusBodies).toEqual([{ status: 1 }])
  })

  it('sends expectedCatalogVersion verbatim and nothing immutable on a material update', async () => {
    const client = createQueryClient()
    const material = makeMaterial()
    const updateBodies: unknown[] = []

    server.use(
      http.put(`${API_BASE_URL}/catalog/materials/${material.id}`, async ({ request }) => {
        updateBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useUpdateMaterialMutation(), {
      wrapper: QueryWrapper,
    })

    await result.current.mutateAsync({ materialId: material.id, request: MATERIAL_REQUEST })

    expect(updateBodies).toEqual([MATERIAL_REQUEST])
    // `rowVersion` is a field no catalog entity except Material's
    // `catalogVersion` equivalent ever had, and it is NOT the token here.
    expect(updateBodies[0]).not.toHaveProperty('rowVersion')
  })

  it('answers a 409 material update with the neutral recovery dialog and no toast', async () => {
    const client = createQueryClient()
    const material = makeMaterial()

    server.use(
      http.put(`${API_BASE_URL}/catalog/materials/${material.id}`, () =>
        errJson(409, { code: 'MATERIALS_CATALOG_VERSION_MISMATCH', message: 'conflict' }),
      ),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useMaterialUpdateWithConflict({}), {
      wrapper: QueryWrapper,
    })

    const saved = await result.current.submit({
      materialId: material.id,
      request: MATERIAL_REQUEST,
    })

    // `false` means "a 409 is being answered", not "the write failed".
    expect(saved).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()

    // The dialog copy asserts nothing about whether the rejected write landed,
    // so it neither claims success nor claims failure. React Query commits the
    // success state in a microtask, so the dialog is awaited rather than read
    // straight off `result.current`.
    await waitFor(() => expect(result.current.dialog).not.toBeNull())
    expect(MATERIAL_UPDATE_CONFLICT_COPY.descriptionAr).toContain('لم يحدّد الخادم')
    expect(MATERIAL_UPDATE_CONFLICT_COPY.titleAr).toContain('تغيّرت المادة')
    expect(MATERIAL_UPDATE_CONFLICT_COPY.slot).toBe('material-conflict-dialog')
  })

  it('rethrows a business 409 so the caller reports it instead of showing the reload dialog', async () => {
    const client = createQueryClient()
    const material = makeMaterial()

    server.use(
      http.put(`${API_BASE_URL}/catalog/materials/${material.id}`, () =>
        errJson(409, {
          code: 'MATERIALS_CATALOG_VERSION_ALREADY_APPLIED',
          message: 'conflict',
        }),
      ),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useMaterialUpdateWithConflict({}), {
      wrapper: QueryWrapper,
    })

    // A 409 on the wire, but not an optimistic-concurrency one: nothing the
    // screen holds is stale, so `capture` must decline and the write's failure
    // must reach the caller's own Arabic feedback.
    await expect(
      result.current.submit({ materialId: material.id, request: MATERIAL_REQUEST }),
    ).rejects.toThrow()

    await waitFor(() => expect(result.current.dialog).toBeNull())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('rethrows a non-409 failure so the caller keeps its own Arabic feedback', async () => {
    const client = createQueryClient()
    const material = makeMaterial()

    server.use(
      http.put(`${API_BASE_URL}/catalog/materials/${material.id}`, () =>
        errJson(400, { code: 'REQUEST_VALIDATION_FAILED', message: 'invalid' }),
      ),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useMaterialUpdateWithConflict({}), {
      wrapper: QueryWrapper,
    })

    await expect(
      result.current.submit({ materialId: material.id, request: MATERIAL_REQUEST }),
    ).rejects.toThrow()

    // A non-409 failure leaves the dialog closed, so the caller's own Arabic
    // toast and inline field-error mapping remain the only feedback.
    await waitFor(() => expect(result.current.dialog).toBeNull())
    expect(toast.error).not.toHaveBeenCalled()
  })
})
