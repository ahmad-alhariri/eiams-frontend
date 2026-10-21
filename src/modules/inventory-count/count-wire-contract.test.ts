import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest'

import type {
  InventoryCount,
  InventoryCountLine,
  InventoryCountListItem,
  InventoryFreezeStatus,
} from '@/modules/inventory-count/types/inventory-count.types'
import {
  createCountService,
  type CountService,
} from '@/modules/inventory-count/services/count.service'
import type { ApiTransport } from '@/shared/api/api-transport'

/**
 * Drift gate for the handwritten inventory-count wire contract (IC-FE-1),
 * mirroring `inventory-wire-contract.test.ts`.
 *
 * Two layers:
 *  1. Type samples annotated with the module's DECLARED interfaces — a field
 *     added to or removed from any of them fails to compile, so the module can
 *     never regress into the stale generated snapshot.
 *  2. A captured-transport run of every one of the 15 consumed endpoints,
 *     pinning the HTTP method, the resolved path, the request-body KEYS
 *     (closed wire bodies: any extra key is a 400 from the live API) and, for
 *     reads, the property set of the baseline.
 */

type BaselineEndpoint = {
  readonly path: string
  readonly method: string
  readonly responseProperties: readonly string[]
}

type Baseline = {
  readonly endpoints: readonly BaselineEndpoint[]
}

const BASELINE_RELATIVE_PATH = '../../../contracts/openapi/eiams-v1.consumer-baseline.json'

let baseline: Baseline

beforeAll(() => {
  const testFilePath = expect.getState().testPath
  if (testFilePath === undefined) {
    throw new Error(
      'Vitest did not report the current test file path; cannot locate the consumer baseline.',
    )
  }
  const baselinePath = join(dirname(testFilePath), BASELINE_RELATIVE_PATH)
  if (!existsSync(baselinePath)) {
    throw new Error(
      `Committed consumer baseline is missing at ${baselinePath}. ` +
        'It is tracked in git; restore it rather than letting the wire gate silently skip.',
    )
  }
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline
})

function responseProperties(path: string, method: string): string[] {
  const endpoint = baseline.endpoints.find(
    (candidate) => candidate.path === path && candidate.method === method,
  )
  if (endpoint === undefined) {
    throw new Error(`consumer baseline has no ${method} ${path}`)
  }
  return [...endpoint.responseProperties].sort()
}

const COUNT_ID = '00000000-0000-4000-8000-0000000000c1'
const LINE_ID = '00000000-0000-4000-8000-0000000000c2'
const WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000c0'
const MATERIAL_DOMAIN_ID = '00000000-0000-4000-8000-0000000000c3'

/** Rubric samples — annotated, sorted, and compared to the committed baseline. */
const COUNT_LIST_ITEM_SAMPLE: InventoryCountListItem = {
  id: COUNT_ID,
  warehouseId: WAREHOUSE_ID,
  countType: 'Scheduled',
  scopeType: 'SelectedMaterials',
  freezePolicy: 'SoftFreeze',
  status: 'Planned',
  rowVersion: 3,
  plannedAtUtc: '2026-10-20T10:00:00.000Z',
  startedAtUtc: null,
  completedAtUtc: null,
  closedAtUtc: null,
  abortedAtUtc: null,
}

const COUNT_DETAIL_SAMPLE: InventoryCount = {
  ...COUNT_LIST_ITEM_SAMPLE,
  materialDomainId: null,
  summary: { totalLines: 4, countedLines: 3, varianceLines: 1, totalAbsoluteDifference: 2 },
  settlement: { status: 'Pending', adjustmentId: null, adjustmentStatus: null },
}

const COUNT_LINE_SAMPLE: InventoryCountLine = {
  id: LINE_ID,
  materialId: '00000000-0000-4000-8000-000000000024',
  assetId: null,
  snapshotQuantity: 25,
  actualQuantity: 23,
  difference: -2,
  varianceReason: null,
}

const FREEZE_STATUS_SAMPLE: InventoryFreezeStatus = {
  warehouseId: WAREHOUSE_ID,
  isPostingBlocked: true,
  isProvisional: false,
  hasSoftFreezeWarning: true,
  activeCounts: [{ countId: COUNT_ID, freezePolicy: 'SoftFreeze' }],
}

/** Captures exactly what the service sent, without any HTTP. */
type CapturedRequest = {
  readonly path: string
  readonly method: string
  readonly body: unknown
  readonly query: unknown
  readonly headers: Record<string, unknown> | undefined
}

function recordingTransport(): { transport: ApiTransport; captures: CapturedRequest[] } {
  const captures: CapturedRequest[] = []
  const capture = (step: {
    path: string
    method: string
    body?: unknown
    query?: unknown
    headers?: Record<string, string>
  }): CapturedRequest => {
    const entry: CapturedRequest = {
      path: step.path,
      method: step.method,
      body: step.body,
      query: step.query,
      headers: step.headers,
    }
    captures.push(entry)
    return entry
  }
  const transport = {
    request: async <TResponse, TBody = undefined>(request: {
      path: string
      method: string
      body?: TBody
      query?: unknown
      headers?: Record<string, string>
    }) => {
      const entry = capture(request as never)
      if (entry.path.startsWith('/inventory-counts')) {
        return { id: COUNT_ID } as TResponse
      }
      return {
        warehouseId: WAREHOUSE_ID,
        isPostingBlocked: true,
        isProvisional: false,
        hasSoftFreezeWarning: true,
        activeCounts: [],
      } as TResponse
    },
    requestEmpty: async (request: {
      path: string
      method: string
      body?: unknown
      query?: unknown
      headers?: Record<string, string>
    }) => {
      capture(request as never)
    },
    requestPage: async <TItem,>(request: {
      path: string
      method: string
      query?: unknown
    }) => {
      capture(request as never)
      const sample: InventoryCountListItem | InventoryCountLine =
        request.path.split('/').length > 2 ? COUNT_LINE_SAMPLE : COUNT_LIST_ITEM_SAMPLE
      return {
        items: [sample as TItem],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      }
    },
  } as unknown as ApiTransport
  return { transport, captures }
}

function buildService(): { service: CountService; captures: CapturedRequest[] } {
  const { transport, captures } = recordingTransport()
  return { service: createCountService(transport), captures }
}

describe('inventory-count wire contract (IC-FE-1)', () => {
  describe('declared response shapes match the committed baseline', () => {
    it('count list item (GET /inventory-counts)', () => {
      expect(Object.keys(COUNT_LIST_ITEM_SAMPLE).sort()).toEqual(
        responseProperties('/inventory-counts', 'GET'),
      )
      expectTypeOf<InventoryCountListItem['status']>().toEqualTypeOf<
        'Planned' | 'InProgress' | 'Completed' | 'Closed' | 'Aborted'
      >()
    })

    it('count detail (GET /inventory-counts/{countId}) extends the list item', () => {
      expect(Object.keys(COUNT_DETAIL_SAMPLE).sort()).toEqual(
        responseProperties('/inventory-counts/{countId}', 'GET'),
      )
      expect(Object.keys(COUNT_DETAIL_SAMPLE.summary).sort()).toEqual([
        'countedLines',
        'totalAbsoluteDifference',
        'totalLines',
        'varianceLines',
      ])
      expect(Object.keys(COUNT_DETAIL_SAMPLE.settlement).sort()).toEqual([
        'adjustmentId',
        'adjustmentStatus',
        'status',
      ])
    })

    it('count line (GET /inventory-counts/{countId}/lines) has no rowVersion', () => {
      expect(Object.keys(COUNT_LINE_SAMPLE).sort()).toEqual(
        responseProperties('/inventory-counts/{countId}/lines', 'GET'),
      )
      expect('expectedRowVersion' in COUNT_LINE_SAMPLE).toBe(false)
    })

    it('warehouse freeze status (GET /warehouses/{warehouseId}/inventory-freeze-status)', () => {
      expect(Object.keys(FREEZE_STATUS_SAMPLE).sort()).toEqual(
        responseProperties('/warehouses/{warehouseId}/inventory-freeze-status', 'GET'),
      )
      expect(Object.keys(FREEZE_STATUS_SAMPLE.activeCounts[0]!).sort()).toEqual([
        'countId',
        'freezePolicy',
      ])
    })
  })

  describe('transport calls for all 15 consumed endpoints', () => {
    const PLAN_BODY = {
      warehouseId: WAREHOUSE_ID,
      countType: 'Scheduled',
      scopeType: 'MaterialDomain',
      materialDomainId: MATERIAL_DOMAIN_ID,
      materialIds: [],
      freezePolicy: 'HardFreeze',
      freezePolicyReason: 'جرد سنوي',
    } as const

    it('lists counts with 1-based paging and optional warehouseId', async () => {
      const { service, captures } = buildService()
      const page = await service.listCounts({
        warehouseId: WAREHOUSE_ID,
        status: 'InProgress',
        page: 1,
        pageSize: 20,
      })
      expect(page.items[0]!).toBeDefined()
      expect(captures[0]!).toMatchObject({
        path: '/inventory-counts',
        method: 'GET',
        query: { warehouseId: WAREHOUSE_ID, status: 'InProgress', page: 1, pageSize: 20 },
      })
      expect(captures[0]!.body).toBeUndefined()
    })

    it('creates a plan (POST /inventory-counts → { id }) with the closed body and Idempotency-Key', async () => {
      const { service, captures } = buildService()
      const created = await service.planCount({ ...PLAN_BODY }, 'key-1')
      expect(created).toEqual({ id: COUNT_ID })
      expect(captures[0]!).toMatchObject({
        path: '/inventory-counts',
        method: 'POST',
        body: PLAN_BODY,
      })
      expect(captures[0]!.headers?.['Idempotency-Key']).toBe('key-1')
    })

    it('reads the count detail', async () => {
      const { service, captures } = buildService()
      const detail = await service.getCount(COUNT_ID)
      expect(detail.id).toBe(COUNT_ID)
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}`,
        method: 'GET',
      })
      expect(captures[0]!.body).toBeUndefined()
    })

    it('starts the count (POST /{countId}/start) with only expectedRowVersion', async () => {
      const { service, captures } = buildService()
      await service.startCount(COUNT_ID, 3)
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/start`,
        method: 'POST',
        body: { expectedRowVersion: 3 },
      })
    })

    it('completes the count (POST /{countId}/complete) with an Idempotency-Key', async () => {
      const { service, captures } = buildService()
      await service.completeCount(COUNT_ID, 3, 'key-2')
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/complete`,
        method: 'POST',
        body: { expectedRowVersion: 3 },
      })
      expect(captures[0]!.headers?.['Idempotency-Key']).toBe('key-2')
    })

    it('closes the count (POST /{countId}/close)', async () => {
      const { service, captures } = buildService()
      await service.closeCount(COUNT_ID, 4)
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/close`,
        method: 'POST',
        body: { expectedRowVersion: 4 },
      })
    })

    it('aborts the count (POST /{countId}/cancel) with the mandatory reason', async () => {
      const { service, captures } = buildService()
      await service.cancelCount(COUNT_ID, { expectedRowVersion: 3, reason: 'سبب الإلغاء' })
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/cancel`,
        method: 'POST',
        body: { expectedRowVersion: 3, reason: 'سبب الإلغاء' },
      })
    })

    it('sets the target status (PUT /{countId}/status)', async () => {
      const { service, captures } = buildService()
      await service.setCountStatus(COUNT_ID, {
        targetStatus: 'InProgress',
        expectedRowVersion: 3,
      })
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/status`,
        method: 'PUT',
        body: { targetStatus: 'InProgress', expectedRowVersion: 3 },
      })
    })

    it('updates the freeze policy (PUT /{countId}/freeze-policy) with no reason key for SoftFreeze', async () => {
      const { service, captures } = buildService()
      await service.setFreezePolicy(COUNT_ID, {
        freezePolicy: 'SoftFreeze',
        expectedRowVersion: 3,
      })
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/freeze-policy`,
        method: 'PUT',
        body: { freezePolicy: 'SoftFreeze', expectedRowVersion: 3 },
      })

      const other = buildService()
      await other.service.setFreezePolicy(COUNT_ID, {
        freezePolicy: 'HardFreeze',
        freezePolicyReason: 'سبب',
        expectedRowVersion: 3,
      })
      expect(other.captures[0]!.body).toEqual({
        freezePolicy: 'HardFreeze',
        freezePolicyReason: 'سبب',
        expectedRowVersion: 3,
      })
    })

    it('lists count lines paged (GET /{countId}/lines)', async () => {
      const { service, captures } = buildService()
      const page = await service.listLines(COUNT_ID, { page: 2, pageSize: 50, onlyVariance: true })
      expect(page.items[0]).toMatchObject({ id: LINE_ID })
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/lines`,
        method: 'GET',
        query: { page: 2, pageSize: 50, onlyVariance: true },
      })
    })

    it('records one actual quantity (PUT /{countId}/lines/{lineId}/actual)', async () => {
      const { service, captures } = buildService()
      await service.updateLineActual(COUNT_ID, LINE_ID, {
        actualQuantity: 23,
        expectedRowVersion: 3,
      })
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/lines/${LINE_ID}/actual`,
        method: 'PUT',
        body: { actualQuantity: 23, expectedRowVersion: 3 },
      })
    })

    it('persists one variance reason (PUT /{countId}/lines/{lineId}/variance-reason)', async () => {
      const { service, captures } = buildService()
      await service.setLineVarianceReason(COUNT_ID, LINE_ID, {
        reason: 'فرق فعلي',
        expectedRowVersion: 4,
      })
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/lines/${LINE_ID}/variance-reason`,
        method: 'PUT',
        body: { reason: 'فرق فعلي', expectedRowVersion: 4 },
      })
    })

    it('batches actuals (PUT /{countId}/actuals) with the aggregate expectedRowVersion', async () => {
      const { service, captures } = buildService()
      await service.updateLines(COUNT_ID, {
        actuals: [{ lineId: LINE_ID, actualQuantity: 23 }],
        expectedRowVersion: 3,
      })
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/actuals`,
        method: 'PUT',
        body: {
          actuals: [{ lineId: LINE_ID, actualQuantity: 23 }],
          expectedRowVersion: 3,
        },
      })
    })

    it('creates the adjustment draft (POST /{countId}/adjustment → { id }), body-less', async () => {
      const { service, captures } = buildService()
      const created = await service.createAdjustment(COUNT_ID, 'key-3')
      expect(created).toEqual({ id: COUNT_ID })
      expect(captures[0]!).toMatchObject({
        path: `/inventory-counts/${COUNT_ID}/adjustment`,
        method: 'POST',
      })
      expect(captures[0]!.body).toBeUndefined()
      expect(captures[0]!.headers?.['Idempotency-Key']).toBe('key-3')
    })

    it('reads the warehouse freeze status', async () => {
      const { service, captures } = buildService()
      const status = await service.getFreezeStatus(WAREHOUSE_ID)
      expect(status.isPostingBlocked).toBe(true)
      expect(captures[0]!).toMatchObject({
        path: `/warehouses/${WAREHOUSE_ID}/inventory-freeze-status`,
        method: 'GET',
      })
      expect(captures[0]!.body).toBeUndefined()
    })
  })
})
