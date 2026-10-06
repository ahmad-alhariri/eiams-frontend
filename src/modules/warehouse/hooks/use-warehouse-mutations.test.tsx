import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { warehouseQueryKeys } from '@/modules/warehouse/hooks/use-warehouse-queries'
import type { Warehouse } from '@/modules/warehouse/types/warehouse.types'
import { createQueryClient } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'
import { apiJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useCreateWarehouseMutation, useUpdateWarehouseMutation } from './use-warehouse-mutations'

const API_BASE_URL = '/api/v1'

const WAREHOUSE_ID = '5d3a7c21-8e64-4b0d-9a37-5c1f2e8d4b60'
const SITE_ID = '2f9b6d54-1a73-4c85-b0e2-7d4a9c3f1b28'
const ORG_UNIT_ID = '6e1d4a97-3b52-49f8-8c60-2a7f5b9d1e43'

/**
 * A warehouse in the REAL wire shape. The shared `createWarehouse` factory still
 * returns the fiction (`warehouseId` / `nameAr` / nested `site`), so this suite
 * declares the projection the backend actually serves.
 */
const WAREHOUSE: Warehouse = {
  id: WAREHOUSE_ID,
  siteId: SITE_ID,
  organizationalUnitId: ORG_UNIT_ID,
  name: 'المستودع المركزي',
  code: 'WH-CENTRAL',
  warehouseType: 'Storage',
  canHoldStock: true,
  status: 'Active',
  rowVersion: 3,
}

describe('warehouse mutation hooks', () => {
  it('invalidates warehouse resources while preserving other scoped feature data', async () => {
    const client = createQueryClient()
    const scope = { kind: 'enterprise' as const }
    const createRequest = {
      siteId: WAREHOUSE.siteId,
      organizationalUnitId: WAREHOUSE.organizationalUnitId ?? ORG_UNIT_ID,
      name: WAREHOUSE.name,
      code: WAREHOUSE.code,
      warehouseType: WAREHOUSE.warehouseType,
      canHoldStock: WAREHOUSE.canHoldStock,
    }
    const warehousesKey = warehouseQueryKeys.warehouses(scope, {})
    const capabilitiesKey = warehouseQueryKeys.capabilities(scope, WAREHOUSE.id)
    const organizationKey = queryKeys.scoped(scope, 'organization', 'sites')
    client.setQueryData(warehousesKey, [])
    client.setQueryData(capabilitiesKey, [])
    client.setQueryData(organizationKey, [])

    let receivedBody: unknown = null
    server.use(
      http.post(`${API_BASE_URL}/warehouses`, async ({ request }) => {
        receivedBody = await request.json()
        return apiJson({ id: WAREHOUSE_ID }, { status: 201 })
      }),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useCreateWarehouseMutation(), { wrapper: QueryWrapper })

    await expect(result.current.mutateAsync(createRequest)).resolves.toEqual({
      id: WAREHOUSE_ID,
    })

    await waitFor(() => {
      expect(client.getQueryState(warehousesKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(capabilitiesKey)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(organizationKey)?.isInvalidated).toBe(false)

    // The create body binds six fields and no others: no `status` (activation is
    // its own route), no concurrency token, and no `nameAr`.
    expect(receivedBody).toEqual(createRequest)
    expect(Object.keys(receivedBody as Record<string, unknown>).sort()).toEqual([
      'canHoldStock',
      'code',
      'name',
      'organizationalUnitId',
      'siteId',
      'warehouseType',
    ])
  })

  it('sends the versioned update body and resolves the empty response without crashing', async () => {
    const client = createQueryClient()
    const scope = { kind: 'enterprise' as const }
    const updateRequest = {
      organizationalUnitId: ORG_UNIT_ID,
      name: 'المستودع المركزي المحدَّث',
      warehouseType: WAREHOUSE.warehouseType,
      canHoldStock: false,
      // The value the read served as `rowVersion`, verbatim.
      expectedRowVersion: WAREHOUSE.rowVersion,
    }
    const detailKey = warehouseQueryKeys.warehouse(scope, WAREHOUSE.id)
    const warehousesKey = warehouseQueryKeys.warehouses(scope, {})
    client.setQueryData(detailKey, WAREHOUSE)
    client.setQueryData(warehousesKey, [])

    let receivedBody: unknown = null
    server.use(
      http.put(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}`, async ({ request }) => {
        receivedBody = await request.json()
        // PUT returns an EMPTY body: no `warehouseId` to destructure.
        return new HttpResponse(null, { status: 204 })
      }),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useUpdateWarehouseMutation(), { wrapper: QueryWrapper })

    await expect(
      result.current.mutateAsync({ warehouseId: WAREHOUSE.id, request: updateRequest }),
    ).resolves.toBeUndefined()

    await waitFor(() => {
      expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(warehousesKey)?.isInvalidated).toBe(true)
    })

    expect(receivedBody).toEqual(updateRequest)
    expect((receivedBody as Record<string, unknown>)['expectedRowVersion']).toBe(3)
    expect(receivedBody).not.toHaveProperty('siteId')
    expect(receivedBody).not.toHaveProperty('code')
    expect(receivedBody).not.toHaveProperty('status')
  })
})
