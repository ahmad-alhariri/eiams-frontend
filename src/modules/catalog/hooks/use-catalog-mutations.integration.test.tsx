import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useCreateMaterialMutation } from '@/modules/catalog/hooks/use-catalog-mutations'
import { toMaterialRequest } from '@/modules/catalog/schemas/material.schemas'
import { createMaterial, fixtureUuid } from '@/test/msw/factories'
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
    const material = createMaterial({ rowVersion: 4 })
    const request = toMaterialRequest(
      {
        baseUnitId: fixtureUuid(23),
        code: ' IT-HW-PC-001 ',
        descriptionAr: '',
        familyId: fixtureUuid(22),
        materialKind: 'Asset',
        nameAr: ' حاسوب مكتبي ',
        requiresAssetNumber: true,
        status: 'Active',
        trackingType: 'Serial',
      },
      material,
    )
    let received: unknown

    server.use(
      http.post(`${API_BASE_URL}/catalog/materials`, async ({ request: httpRequest }) => {
        received = await httpRequest.json()
        return HttpResponse.json(material, { status: 201 })
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
