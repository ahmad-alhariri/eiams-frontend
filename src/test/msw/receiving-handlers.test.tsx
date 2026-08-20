import { afterEach, describe, expect, it, vi } from 'vitest'

import { createReceivingSuppliersHandler } from '@/test/msw/receiving-handlers'
import { server } from '@/test/msw/server'
import { apiClient } from '@/shared/services/api.client'
import { QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { renderHook } from '@testing-library/react'
import { type PropsWithChildren } from 'react'

import { createReceivingService } from '@/modules/receiving/services/receiving.service'
import { useReceivingSuppliersLoader } from '@/modules/receiving/hooks/use-receiving-suppliers-loader'
import { createQueryClient } from '@/shared/services/query.client'
import { environment } from '@/config/env'

apiClient.defaults.adapter = 'xhr'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const SUPPLIERS = ['مورد الشام', 'مورد النور', 'الشركة العامة للصناعات', 'مؤسسة الإمداد']

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('createReceivingSuppliersHandler', () => {
  it('answers the contract endpoint with distinct, search-filtered suggestions', async () => {
    server.use(...createReceivingSuppliersHandler([...SUPPLIERS, 'مورد الشام']))
    const service = createReceivingService(apiClient)

    await expect(service.searchReceivingSuppliers('شام')).resolves.toEqual(['مورد الشام'])
    await expect(service.searchReceivingSuppliers('مؤسسة')).resolves.toEqual(['مؤسسة الإمداد'])
    await expect(service.searchReceivingSuppliers('غير موجود')).resolves.toEqual([])
  })

  it('caps suggestions at ten items', async () => {
    const many = Array.from({ length: 15 }, (_, index) => `مورد رقم ${index + 1}`)
    server.use(...createReceivingSuppliersHandler(many))
    const service = createReceivingService(apiClient)

    await expect(service.searchReceivingSuppliers('مورد رقم')).resolves.toHaveLength(10)
  })
})

describe('useReceivingSuppliersLoader', () => {
  it('loads distinct supplier suggestions mapped to options for a query', async () => {
    const wrapper = createWrapper()
    server.use(...createReceivingSuppliersHandler(SUPPLIERS))

    const { result } = renderHook(() => useReceivingSuppliersLoader(), { wrapper })
    expect(result.current.scopeReady).toBe(true)

    await expect(result.current.loadOptions('شام')).resolves.toEqual([
      { value: 'مورد الشام', label: 'مورد الشام' },
    ])
    await expect(result.current.loadOptions('نور')).resolves.toEqual([
      { value: 'مورد النور', label: 'مورد النور' },
    ])
  })

  it('resolves to an empty list while the query is below the minimum length', async () => {
    const wrapper = createWrapper()
    server.use(...createReceivingSuppliersHandler(SUPPLIERS))

    const { result } = renderHook(() => useReceivingSuppliersLoader(), { wrapper })
    await expect(result.current.loadOptions('م')).resolves.toEqual([])
  })

  it('resolves to an empty list until a scope is active', async () => {
    const wrapper = createWrapper()
    server.use(...createReceivingSuppliersHandler(SUPPLIERS))
    activeScope.key = undefined

    const { result } = renderHook(() => useReceivingSuppliersLoader(), { wrapper })
    expect(result.current.scopeReady).toBe(false)
    await expect(result.current.loadOptions('شام')).resolves.toEqual([])
  })

  it('deduplicates repeated queries through the shared query client cache', async () => {
    let calls = 0
    const wrapper = createWrapper()
    server.use(
      http.get(`${environment.apiBaseUrl}/receiving/suppliers`, () => {
        calls += 1
        return HttpResponse.json(['مورد الشام'])
      }),
    )

    const { result } = renderHook(() => useReceivingSuppliersLoader(), { wrapper })
    await result.current.loadOptions('شام')
    await result.current.loadOptions('شام')
    expect(calls).toBe(1)
  })
})
