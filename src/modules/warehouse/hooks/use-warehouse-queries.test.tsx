import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import {
  createPage,
  createWarehouse,
  createWarehouseCapability,
  createWarehouseMaterialSetting,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  useWarehouseCapabilitiesQuery,
  useWarehouseMaterialSettingsQuery,
  useWarehouseQuery,
  useWarehousesQuery,
  warehouseQueryKeys,
} from './use-warehouse-queries'

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

describe('warehouse query hooks', () => {
  it('uses scope-isolated keys for warehouse lists, capabilities, and material settings', () => {
    const scope = { kind: 'enterprise' as const }
    const query = { status: 'Active' as const }

    expect(warehouseQueryKeys.warehouses(scope, query)).toEqual([
      'scoped',
      'enterprise',
      null,
      'warehouse',
      'warehouses',
      query,
    ])
    expect(warehouseQueryKeys.capabilities(scope, 'warehouse-1')).toEqual([
      'scoped',
      'enterprise',
      null,
      'warehouse',
      'warehouses',
      'warehouse-1',
      'capabilities',
    ])
    expect(warehouseQueryKeys.materialSettings(scope, 'warehouse-1', {})).toEqual([
      'scoped',
      'enterprise',
      null,
      'warehouse',
      'warehouses',
      'warehouse-1',
      'material-settings',
      {},
    ])
  })

  it('reads each warehouse resource through scoped master-data queries', async () => {
    const warehouse = createWarehouse()
    const capability = createWarehouseCapability({ warehouseId: warehouse.warehouseId })
    const setting = createWarehouseMaterialSetting({ warehouseId: warehouse.warehouseId })

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([warehouse]))),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}`, () =>
        HttpResponse.json(warehouse),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.warehouseId}/material-settings`, () =>
        HttpResponse.json(createPage([setting])),
      ),
    )

    const warehouses = renderHook(() => useWarehousesQuery({ siteId: warehouse.site.id }), {
      wrapper: createWrapper(),
    })
    const warehouseDetail = renderHook(() => useWarehouseQuery(warehouse.warehouseId), {
      wrapper: createWrapper(),
    })
    const capabilities = renderHook(() => useWarehouseCapabilitiesQuery(warehouse.warehouseId), {
      wrapper: createWrapper(),
    })
    const materialSettings = renderHook(
      () => useWarehouseMaterialSettingsQuery(warehouse.warehouseId, { search: 'حاسوب' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(warehouses.result.current.isSuccess).toBe(true)
      expect(warehouseDetail.result.current.isSuccess).toBe(true)
      expect(capabilities.result.current.isSuccess).toBe(true)
      expect(materialSettings.result.current.isSuccess).toBe(true)
    })

    expect(warehouses.result.current.data?.items).toEqual([warehouse])
    expect(warehouseDetail.result.current.data).toEqual(warehouse)
    expect(capabilities.result.current.data).toEqual([capability])
    expect(materialSettings.result.current.data?.items).toEqual([setting])
  })

  it('does not request warehouse data before a server-selected scope exists', async () => {
    activeScope.key = undefined
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => {
        requestCount += 1
        return HttpResponse.json(createPage([createWarehouse()]))
      }),
    )

    const { result } = renderHook(() => useWarehousesQuery({ search: 'مركزي' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(result.current.data).toBeUndefined()
    expect(requestCount).toBe(0)
  })
})
