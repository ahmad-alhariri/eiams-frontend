import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { warehouseQueryKeys } from '@/modules/warehouse/hooks/use-warehouse-queries'
import { createQueryClient } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'
import { createWarehouse } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useCreateWarehouseMutation } from './use-warehouse-mutations'

const API_BASE_URL = '/api/v1'

describe('warehouse mutation hooks', () => {
  it('invalidates warehouse resources while preserving other scoped feature data', async () => {
    const client = createQueryClient()
    const scope = { kind: 'enterprise' as const }
    const warehouse = createWarehouse()
    const warehouseRequest = {
      siteId: warehouse.site.id,
      code: warehouse.code,
      nameAr: warehouse.nameAr,
      rowVersion: warehouse.rowVersion,
      status: warehouse.status,
      ...(warehouse.locationAr === undefined ? {} : { locationAr: warehouse.locationAr }),
    }
    const warehousesKey = warehouseQueryKeys.warehouses(scope, {})
    const capabilitiesKey = warehouseQueryKeys.capabilities(scope, warehouse.warehouseId)
    const organizationKey = queryKeys.scoped(scope, 'organization', 'sites')
    client.setQueryData(warehousesKey, [])
    client.setQueryData(capabilitiesKey, [])
    client.setQueryData(organizationKey, [])

    server.use(
      http.post(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(warehouse, { status: 201 })),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useCreateWarehouseMutation(), { wrapper: QueryWrapper })

    await result.current.mutateAsync(warehouseRequest)

    await waitFor(() => {
      expect(client.getQueryState(warehousesKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(capabilitiesKey)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(organizationKey)?.isInvalidated).toBe(false)
  })
})
