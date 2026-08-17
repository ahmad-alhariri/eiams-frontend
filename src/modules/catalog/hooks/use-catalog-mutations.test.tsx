import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { catalogQueryKeys } from '@/modules/catalog/hooks/use-catalog-queries'
import { createQueryClient } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'
import { createMaterialDomain } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useCreateMaterialDomainMutation } from './use-catalog-mutations'

const API_BASE_URL = '/api/v1'

describe('catalog mutation hooks', () => {
  it('invalidates every affected catalog hierarchy key while preserving other scoped resources', async () => {
    const client = createQueryClient()
    const scope = { kind: 'enterprise' as const }
    const domain = createMaterialDomain()
    const domainRequest = {
      code: domain.code,
      nameAr: domain.nameAr,
      rowVersion: domain.rowVersion,
      status: domain.status,
    }
    const catalogListKey = catalogQueryKeys.materialDomains(scope, {})
    const materialKey = catalogQueryKeys.material(scope, 'material-1')
    const organizationKey = queryKeys.scoped(scope, 'organization', 'sites')
    client.setQueryData(catalogListKey, [])
    client.setQueryData(materialKey, {})
    client.setQueryData(organizationKey, [])

    server.use(
      http.post(`${API_BASE_URL}/catalog/domains`, () =>
        HttpResponse.json(domain, { status: 201 }),
      ),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useCreateMaterialDomainMutation(), {
      wrapper: QueryWrapper,
    })

    await result.current.mutateAsync(domainRequest)

    await waitFor(() => {
      expect(client.getQueryState(catalogListKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(materialKey)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(organizationKey)?.isInvalidated).toBe(false)
  })
})
