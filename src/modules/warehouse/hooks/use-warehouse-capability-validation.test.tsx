import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { createNamedReference, createWarehouseCapability, fixtureUuid } from '@/test/msw/factories'
import { okJson } from '@/test/msw/envelope'
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
        okJson([capability]),
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
        okJson([capability]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The block copy is the single sentence the product renders — the line editors
    // and the Opening preflight all surface this exact string from this one
    // gate, so a per-domain variant here would be copy no user ever sees.
    expect(result.current.validates(capability.domainId, 'Issue')).toEqual({
      status: 'blocked',
      messageAr: 'العملية صرف غير مدعومة لهذا المستودع والمجال المطلوبين.',
    })
  })

  it('blocks a domain with no capability row using the fallback material message', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        okJson([createWarehouseCapability({ warehouseId: WAREHOUSE_ID })]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.validates(fixtureUuid(99), 'Issue')).toEqual({
      status: 'blocked',
      messageAr: 'العملية صرف غير مدعومة لهذا المستودع والمجال المطلوبين.',
    })
  })

  it('returns operations for a known domain and a stable empty array otherwise', async () => {
    const capability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      operations: ['Receiving', 'Issue', 'Transfer'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        okJson([capability]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // `getOperationsForDomain` resolves membership, so it hands back a Set (the
    // hook's declared `ReadonlySet<CapabilityOperation>`), not the wire array.
    // A miss is the SAME shared empty Set, so a caller memoizing on the result is
    // not re-run on every render for a domain with no capability row.
    expect(result.current.getOperationsForDomain(capability.domainId)).toStrictEqual(
      new Set(['Receiving', 'Issue', 'Transfer']),
    )
    const emptyFirst = result.current.getOperationsForDomain(fixtureUuid(99))
    const emptySecond = result.current.getOperationsForDomain('')
    expect(emptyFirst.size).toBe(0)
    expect(emptySecond).toBe(emptyFirst)
  })

  it('returns unknown and makes no request when warehouseId is undefined', async () => {
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () => {
        requestCount += 1
        return okJson([createWarehouseCapability({ warehouseId: WAREHOUSE_ID })])
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
        return okJson([createWarehouseCapability({ warehouseId: WAREHOUSE_ID })])
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

  it('treats an empty-string domain id (unselected material line) as unknown, not blocked', async () => {
    const capability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      operations: ['Receiving'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        okJson([capability]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.validates('', 'Receiving')).toEqual({ status: 'unknown' })
  })

  it('validates two capabilities with independent domains independently', async () => {
    const itCapability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      operations: ['Receiving', 'Issue', 'Transfer'],
    })
    // `domainId` is the key the hook resolves on; `domain` is only the label it
    // would display. Overriding the label alone left both rows keyed on the
    // default domainId(20), so the finance row silently replaced the IT row
    // instead of yielding two independent domains.
    const financeCapability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      domainId: fixtureUuid(21),
      domain: createNamedReference({ id: fixtureUuid(21), displayName: 'الشؤون المالية' }),
      operations: ['Count'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        okJson([itCapability, financeCapability]),
      ),
    )

    const { result } = renderHook(() => useWarehouseCapabilityValidation(WAREHOUSE_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.validates(fixtureUuid(20), 'Issue')).toEqual({ status: 'supported' })
    expect(result.current.validates(fixtureUuid(20), 'Count')).toEqual({
      status: 'blocked',
      messageAr: 'العملية جرد غير مدعومة لهذا المستودع والمجال المطلوبين.',
    })
    expect(result.current.validates(fixtureUuid(21), 'Count')).toEqual({ status: 'supported' })
    expect(result.current.validates(fixtureUuid(21), 'Issue')).toEqual({
      status: 'blocked',
      messageAr: 'العملية صرف غير مدعومة لهذا المستودع والمجال المطلوبين.',
    })
  })
})
