import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useCreateMaterialMutation } from '@/modules/catalog/hooks/use-catalog-mutations'
import { toCreateMaterialRequest } from '@/modules/catalog/schemas/material.schemas'
import { apiJson } from '@/test/msw/envelope'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

describe('material core mutation integration', () => {
  it('sends the complete contract payload through the shared mutation using MSW', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const material = {
      id: fixtureUuid(24),
      familyId: fixtureUuid(22),
      nameAr: 'حاسوب مكتبي',
      nameEn: null,
      code: 'IT-HW-PC-001',
      materialKind: 'Asset' as const,
      trackingType: 'Serial' as const,
      hasExpiry: false,
      requiresAssetNumber: true,
      catalogVersion: 4,
      attributes: null,
      status: 'Active' as const,
      materialDomainId: fixtureUuid(20),
      materialDomainName: 'تقنية المعلومات',
      baseUnitId: fixtureUuid(23),
      baseUnitSymbol: 'EA',
    }
    const request = toCreateMaterialRequest({
      code: 'IT-HW-PC-001',
      nameAr: 'حاسوب مكتبي',
      nameEn: null,
      familyId: fixtureUuid(22),
      baseUnitId: fixtureUuid(23),
      materialKind: 'Asset',
      trackingType: 'Serial',
      hasExpiry: false,
      attributes: null,
    })
    let received: unknown

    server.use(
      http.post(`${API_BASE_URL}/catalog/materials`, async ({ request: httpRequest }) => {
        received = await httpRequest.json()
        // `apiJson` with an explicit 2xx, so the classification is by STATUS and
        // not by key-name guessing — `Material` legitimately owns a business
        // `code` property, and the shape heuristic would read it as an error.
        return apiJson(material, { status: 200 })
      }),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useCreateMaterialMutation(), { wrapper: QueryWrapper })

    await result.current.mutateAsync(request)

    expect(received).toEqual(request)
  })
})
