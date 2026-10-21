import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest'

import type {
  InventoryBalance,
  InventoryLowStockStateCode,
  StockMovement,
} from '@/modules/inventory/types/inventory.api-types'
import type { InventoryReportRow } from '@/modules/reports/types/reports.types'

/**
 * Drift gate between the handwritten inventory wire contract and the LIVE
 * consumer baseline.
 *
 * `src/shared/api/openapi-drift.ts` compares the live swagger to the baseline;
 * nothing compared the frontend's DECLARED types to it, so the stale nested
 * shape could survive in `inventory.api-types` while every other check passed.
 * The sample values below are annotated with the declared types, so a field
 * added to or removed from either interface fails to compile, and the runtime
 * assertion then compares the property names to the baseline.
 *
 * The baseline is COMMITTED (`contracts/openapi/eiams-v1.consumer-baseline.json`)
 * and is the fingerprint captured from the live API, so its absence is a defect
 * and fails the gate instead of silently disabling it.
 */

type BaselineEndpoint = {
  readonly path: string
  readonly method: string
  readonly responseProperties: readonly string[]
}

type Baseline = {
  readonly endpoints: readonly BaselineEndpoint[]
}

// Resolved from the test file, not `process.cwd()`, so the gate enforces the
// same baseline no matter where Vitest is launched from.
const BASELINE_RELATIVE_PATH = '../../../contracts/openapi/eiams-v1.consumer-baseline.json'

let baseline: Baseline

function loadBaseline(baselinePath: string): Baseline {
  if (!existsSync(baselinePath)) {
    throw new Error(
      `Committed consumer baseline is missing at ${baselinePath}. ` +
        'It is tracked in git (added with the inventory read contract); restore it ' +
        'rather than letting the wire gate silently skip.',
    )
  }
  return JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline
}

beforeAll(() => {
  const testFilePath = expect.getState().testPath
  if (testFilePath === undefined) {
    throw new Error(
      'Vitest did not report the current test file path; cannot locate the consumer baseline.',
    )
  }
  baseline = loadBaseline(join(dirname(testFilePath), BASELINE_RELATIVE_PATH))
})

function responseProperties(path: string): string[] {
  const endpoint = baseline.endpoints.find(
    (candidate) => candidate.path === path && candidate.method === 'GET',
  )
  if (endpoint === undefined) {
    throw new Error(`consumer baseline has no GET ${path}`)
  }
  return [...endpoint.responseProperties].sort()
}

const INVENTORY_BALANCE_SAMPLE: InventoryBalance = {
  id: '00000000-0000-4000-8000-000000000040',
  warehouseId: '00000000-0000-4000-8000-000000000030',
  warehouseCode: 'WH-CENTRAL',
  warehouseName: 'المستودع المركزي',
  materialId: '00000000-0000-4000-8000-000000000024',
  materialCode: 'IT-HW-PC-001',
  materialNameAr: 'حاسوب مكتبي',
  quantity: 10,
  lastUpdatedUtc: '2026-08-21T10:00:00.000Z',
  rowVersion: 1,
  lowStock: { state: 1, thresholdQuantity: 5 },
}

const STOCK_MOVEMENT_SAMPLE: StockMovement = {
  id: '00000000-0000-4000-8000-000000000070',
  warehouseId: '00000000-0000-4000-8000-000000000030',
  warehouseCode: 'WH-CENTRAL',
  warehouseName: 'المستودع المركزي',
  materialId: '00000000-0000-4000-8000-000000000024',
  materialCode: 'IT-HW-PC-001',
  materialNameAr: 'حاسوب مكتبي',
  documentId: '00000000-0000-4000-8000-000000000060',
  documentReferenceNumber: 'RCP-2026-0001',
  lineId: '00000000-0000-4000-8000-000000000061',
  movementType: 'Receipt',
  quantityDelta: 5,
  postedAtUtc: '2026-08-21T10:00:00.000Z',
  postedBy: '00000000-0000-4000-8000-000000000010',
}

const INVENTORY_REPORT_ROW_SAMPLE: InventoryReportRow = {
  materialId: '00000000-0000-4000-8000-000000000024',
  materialCode: 'IT-HW-PC-001',
  materialNameAr: 'حاسوب مكتبي',
  totalQuantity: 10,
  warehouseCount: 1,
  lastUpdatedUtc: '2026-08-21T10:00:00.000Z',
}

describe('inventory wire contract', () => {
  it('declares exactly the live InventoryBalance response properties', () => {
    expect(Object.keys(INVENTORY_BALANCE_SAMPLE).sort()).toEqual(
      responseProperties('/inventory/balances'),
    )
  })

  it('declares exactly the live StockMovement response properties', () => {
    expect(Object.keys(STOCK_MOVEMENT_SAMPLE).sort()).toEqual(
      responseProperties('/inventory/movements'),
    )
  })

  it('declares exactly the live InventoryReportRow response properties', () => {
    expect(Object.keys(INVENTORY_REPORT_ROW_SAMPLE).sort()).toEqual(
      responseProperties('/reports/inventory'),
    )
  })

  it('declares the nested lowStock shape with a numeric state', () => {
    // The baseline's flat `responseProperties` cannot express a nested object,
    // so the key set is stated explicitly. Source of truth: the live capture
    // recorded in `inventory.api-types.ts` and the backend DTO
    // `Application/InventoryBalances/GetList/LowStockProjectionResponse.cs`
    // (`State`, `ThresholdQuantity`), serialized as numbers by the Minimal API.
    expect(Object.keys(INVENTORY_BALANCE_SAMPLE.lowStock).sort()).toEqual([
      'state',
      'thresholdQuantity',
    ])

    expect(typeof INVENTORY_BALANCE_SAMPLE.lowStock.state).toBe('number')
    expect([0, 1, 2, 3]).toContain(INVENTORY_BALANCE_SAMPLE.lowStock.state)
    expectTypeOf<
      InventoryBalance['lowStock']['state']
    >().toEqualTypeOf<InventoryLowStockStateCode>()
  })
})
