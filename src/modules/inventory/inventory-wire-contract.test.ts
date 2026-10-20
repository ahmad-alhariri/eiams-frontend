import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type {
  InventoryBalance,
  StockMovement,
} from '@/modules/inventory/types/inventory.api-types'

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
 */

type BaselineEndpoint = {
  readonly path: string
  readonly method: string
  readonly responseProperties: readonly string[]
}

type Baseline = {
  readonly endpoints: readonly BaselineEndpoint[]
}

// The baseline is an UNTRACKED ratchet captured from the live API, so a clean
// checkout may not have it. Read it conditionally (a static `?raw` import would
// fail to transform) and skip the gate when it is absent; whenever the file is
// present the shape is still enforced.
const BASELINE_PATH = join(process.cwd(), 'contracts/openapi/eiams-v1.consumer-baseline.json')
const baseline = existsSync(BASELINE_PATH)
  ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline)
  : undefined

function responseProperties(path: string): string[] {
  const endpoint = baseline?.endpoints.find(
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

describe.skipIf(baseline === undefined)('inventory wire contract', () => {
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
})
