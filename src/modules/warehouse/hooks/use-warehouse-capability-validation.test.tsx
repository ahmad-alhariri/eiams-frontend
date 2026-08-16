import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { createNamedReference, createWarehouseCapability, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useWarehouseCapabilityValidation } from './use-warehouse-capability-validation'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = fixtureUuid(30)

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  vi.clearAllMocks()
})

describe('useWarehouseCapabilityValidation', () => {
  it('validates supported for operations inside the capability set', async () => {
    const capability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      operations: ['Receiving', 'Issue', 'Transfer'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.validates(capability.domain.id, 'Issue')).toEqual({
      status: 'supported',
    })
    expect(result.current.validates(capability.domain.id, 'Transfer')).toEqual({
      status: 'supported',
    })
  })

  it('blocks an operation missing from an existing capability row with the exact Arabic message', async () => {
    const capability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      operations: ['Receiving'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.validates(capability.domain.id, 'Issue')).toEqual({
      status: 'blocked',
      messageAr: `المستودع لا يمتلك قدرة "صرف" لمجال "تقنية المعلومات".`,
    })
  })

  it('blocks a domain with no capability row using the fallback material message', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        HttpResponse.json([createWarehouseCapability({ warehouseId: WAREHOUSE_ID })]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.validates(fixtureUuid(99), 'Issue')).toEqual({
      status: 'blocked',
      messageAr: `المستودع لا يمتلك قدرة "صرف" لمجال هذه المادة.`,
    })
  })

  it('returns operations for a known domain and a stable empty array otherwise', async () => {
    const capability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      operations: ['Receiving', 'Issue', 'Transfer'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.getOperationsForDomain(capability.domain.id)).toStrictEqual([
      'Receiving',
      'Issue',
      'Transfer',
    ])
    const emptyFirst = result.current.getOperationsForDomain(fixtureUuid(99))
    const emptySecond = result.current.getOperationsForDomain(undefined)
    expect(emptyFirst).toStrictEqual([])
    expect(emptySecond).toBe(emptyFirst)
  })

  it('returns unknown and makes no request when warehouseId is undefined', async () => {
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () => {
        requestCount += 1
        return HttpResponse.json([createWarehouseCapability({ warehouseId: WAREHOUSE_ID })])
      }),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(undefined), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.validates(fixtureUuid(20), 'Issue')).toEqual({ status: 'unknown' })
    expect(requestCount).toBe(0)
  })

  it('returns unknown while the capabilities query is still loading', async () => {
    let resolveRequest: (() => void) | undefined
    const deferred = new Promise<void>((resolve) => {
      resolveRequest = resolve
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, async () => {
        await deferred
        return HttpResponse.json([createWarehouseCapability({ warehouseId: WAREHOUSE_ID })])
      }),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(true))
    expect(result.current.validates(fixtureUuid(20), 'Issue')).toEqual({ status: 'unknown' })

    resolveRequest?.()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.validates(fixtureUuid(20), 'Issue')).toEqual({ status: 'supported' })
  })

  it('returns unknown when the capabilities request fails', async () => {
    server.use(
      http.get(
        `${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 })

    expect(result.current.validates(fixtureUuid(20), 'Issue')).toEqual({ status: 'unknown' })
  })

  it('validates two capabilities with independent domains independently', async () => {
    const itCapability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      operations: ['Receiving', 'Issue', 'Transfer'],
    })
    const financeCapability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      capabilityId: fixtureUuid(33),
      domain: createNamedReference({ id: fixtureUuid(21), displayName: 'الشؤون المالية' }),
      operations: ['Count'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        HttpResponse.json([itCapability, financeCapability]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.validates(fixtureUuid(20), 'Issue')).toEqual({ status: 'supported' })
    expect(result.current.validates(fixtureUuid(20), 'Count')).toEqual({
      status: 'blocked',
      messageAr: `المستودع لا يمتلك قدرة "جرد" لمجال "تقنية المعلومات".`,
    })
    expect(result.current.validates(fixtureUuid(21), 'Count')).toEqual({ status: 'supported' })
    expect(result.current.validates(fixtureUuid(21), 'Issue')).toEqual({
      status: 'blocked',
      messageAr: `المستودع لا يمتلك قدرة "صرف" لمجال "الشؤون المالية".`,
    })
  })
})
