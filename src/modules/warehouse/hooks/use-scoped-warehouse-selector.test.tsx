import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { createPage, createWarehouse } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useScopedWarehouseSelector } from './use-scoped-warehouse-selector'

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

describe('useScopedWarehouseSelector', () => {
  it('loads warehouses through the scoped contract list and maps them to options', async () => {
    const central = createWarehouse({
      warehouseId: '00000000-0000-4000-8000-000000000001',
      code: 'WH-1',
      nameAr: 'المستودع المركزي',
    })
    const archive = createWarehouse({
      warehouseId: '00000000-0000-4000-8000-000000000002',
      code: 'WH-2',
      nameAr: 'المستودع الأرشيفي',
      status: 'Inactive',
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        const search = new URL(request.url).searchParams.get('search') ?? ''
        const items = search === '' ? [central, archive] : [central]
        return HttpResponse.json(createPage(items))
      }),
    )
    const { result } = renderHook(() => useScopedWarehouseSelector(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.scopeReady).toBe(true))

    const options = await result.current.loadOptions('')
    expect(options).toHaveLength(2)
    expect(options[0]).toEqual({
      value: central.warehouseId,
      label: central.nameAr,
      payload: central,
      disabled: false,
    })
    expect(options[1]).toEqual({
      value: archive.warehouseId,
      label: archive.nameAr,
      payload: archive,
      disabled: true,
    })
  })

  it('passes the server-side search query to the list endpoint', async () => {
    const central = createWarehouse({ nameAr: 'المستودع المركزي' })
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        const search = new URL(request.url).searchParams.get('search') ?? ''
        return HttpResponse.json(createPage(search.includes('مركزي') ? [central] : []))
      }),
    )
    const { result } = renderHook(() => useScopedWarehouseSelector(), {
      wrapper: createWrapper(),
    })

    const options = await result.current.loadOptions('مركزي')
    expect(options).toHaveLength(1)
    expect(options[0]?.value).toBe(central.warehouseId)
  })

  it('resolves to an empty list and reports scopeReady=false without a selected scope', async () => {
    activeScope.key = undefined
    let requests = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => {
        requests += 1
        return HttpResponse.json(createPage([]))
      }),
    )
    const { result } = renderHook(() => useScopedWarehouseSelector(), {
      wrapper: createWrapper(),
    })

    expect(result.current.scopeReady).toBe(false)
    await expect(result.current.loadOptions('')).resolves.toEqual([])
    expect(requests).toBe(0)
  })

  it('propagates loader failures to the caller for the AsyncSelect error state', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => new HttpResponse(null, { status: 500 })),
    )
    const { result } = renderHook(() => useScopedWarehouseSelector(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.loadOptions('مركزي')).rejects.toThrow()
  })
})
