import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import {
  createWarehouseService,
  setWarehouseService,
} from '@/modules/warehouse/services/warehouse.service'
import { okJson, okPageJson } from '@/test/msw/envelope'
import {
  createWarehouse,
  createWarehouseCapability,
  createWarehouseMaterialSetting,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

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
    const capability = createWarehouseCapability({ warehouseId: warehouse.id })
    const setting = createWarehouseMaterialSetting({ warehouseId: warehouse.id })

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}`, () => okJson(warehouse)),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/capabilities`, () =>
        okJson([capability]),
      ),
      http.get(`${API_BASE_URL}/warehouses/${warehouse.id}/material-settings`, () =>
        okPageJson([setting]),
      ),
    )

    const warehouses = renderHook(() => useWarehousesQuery({ siteId: warehouse.siteId }), {
      wrapper: createWrapper(),
    })
    const warehouseDetail = renderHook(() => useWarehouseQuery(warehouse.id), {
      wrapper: createWrapper(),
    })
    const capabilities = renderHook(() => useWarehouseCapabilitiesQuery(warehouse.id), {
      wrapper: createWrapper(),
    })
    const materialSettings = renderHook(
      () => useWarehouseMaterialSettingsQuery(warehouse.id, { search: 'حاسوب' }),
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
        return okPageJson([createWarehouse()])
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

/**
 * The cancellation tracer, pinned end to end.
 *
 * `whhu.13` added `signal` to `ApiTransport` and proved it there, but a
 * capability nothing calls is dead code, so the warehouse module — `lvtk`'s
 * module — wires it for real: hook forwards the query signal, service carries
 * it as a `RequestContext`, transport aborts Axios. These three cases pin each
 * hop so the other module beads copy a tested pattern rather than a shape.
 *
 * The non-vacuity half is the third case: a hook that drops the signal resolves
 * normally and the first two still pass, so the suite cannot distinguish
 * "wired" from "silently ignoring cancellation" — which is exactly the mistake
 * that produced the original defect.
 */
describe('warehouse reads are cancellable (whhu.13 tracer)', () => {
  it('the hook forwards the query signal to the service', async () => {
    const warehouse = createWarehouse()

    server.use(http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])))

    // Asserted at the transport BOUNDARY, not at the MSW boundary. MSW always
    // exposes a `request.signal` of its own, so reading it there would pass
    // whether or not the hook forwarded anything — the first version of this
    // case did exactly that and was vacuous. The request object the transport
    // receives is the only place the hook's contribution is visible.
    const { transport } = registerTestTransportHarness(API_BASE_URL)()
    const requestPage = vi.spyOn(transport, 'requestPage')
    setWarehouseService(transport)

    const { result } = renderHook(() => useWarehousesQuery({}), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const sent = requestPage.mock.calls.at(0)?.at(0)
    expect(sent?.signal).toBeInstanceOf(AbortSignal)
    expect(sent?.signal?.aborted).toBe(false)
  })

  it('cancelling a query aborts the signal the hook handed the service', async () => {
    const controller = new AbortController()

    // The handler holds the response open so the request is still IN FLIGHT
    // when the cancel lands. TanStack Query aborts the signal only for an
    // unfinished request, so a resolved query would make this case pass by
    // doing nothing.
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, async () => {
        await new Promise<void>((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(), { once: true })
        })
        return okPageJson([createWarehouse()])
      }),
    )

    const { transport } = registerTestTransportHarness(API_BASE_URL)()
    const requestPage = vi.spyOn(transport, 'requestPage')
    setWarehouseService(transport)

    const client = createQueryClient()
    const { result } = renderHook(() => useWarehousesQuery({}), {
      wrapper: function Wrapper({ children }: PropsWithChildren) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>
      },
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('fetching'))
    const sent = requestPage.mock.calls.at(0)?.at(0)
    expect(sent?.signal?.aborted).toBe(false)

    await client.cancelQueries({
      queryKey: warehouseQueryKeys.warehouses({ kind: 'enterprise' }, {}),
    })

    // If the hook had substituted its own signal, or dropped the one it was
    // given, this stays false and the socket outlives the query that wanted it.
    expect(sent?.signal?.aborted).toBe(true)
  })

  it('a service read rejects when its context signal is aborted', async () => {
    const warehouse = createWarehouse()
    const controller = new AbortController()

    server.use(
      http.get(`${API_BASE_URL}/warehouses`, async () => {
        // Hold the response until the abort lands, so the abort is what ends
        // the request rather than the handler returning first.
        await new Promise<void>((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(), { once: true })
        })
        return okPageJson([warehouse])
      }),
    )

    const { transport } = registerTestTransportHarness(API_BASE_URL)()
    const service = createWarehouseService(transport)
    const pending = service.listWarehouses({}, { signal: controller.signal })

    controller.abort()

    // Rejecting rather than resolving is the point: a cancelled read that
    // resolved would hand the caller data it has already discarded.
    await expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  })

  it('the non-vacuity control: an un-aborted read still resolves', async () => {
    const warehouse = createWarehouse()
    const controller = new AbortController()

    server.use(http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])))

    const { transport } = registerTestTransportHarness(API_BASE_URL)()
    const service = createWarehouseService(transport)

    // A signal that never fires must not break the ordinary path, or
    // "supports cancellation" would be indistinguishable from "breaks every
    // read".
    const page = await service.listWarehouses({}, { signal: controller.signal })

    expect(page.items).toEqual([warehouse])
    expect(controller.signal.aborted).toBe(false)
  })
})
