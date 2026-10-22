import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import type {
  Asset,
  AssetCurrentStatusInfo,
  AssetCustodyTimelineRow,
  AssetDetails,
  AssetMovement,
} from '@/modules/asset/types/asset.types'

/**
 * Drift gate between the handwritten ASSET wire contract and the LIVE
 * consumer baseline.
 *
 * `src/shared/api/openapi-drift.ts` compares the live swagger to the baseline;
 * nothing compared the frontend's DECLARED types to it, so a stale field could
 * survive in `asset.types.ts` while every other check passed. The sample values
 * below are annotated with the declared types, so a field added to or removed
 * from an interface fails to compile, and the runtime assertion then compares
 * the property names to the baseline.
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

function responseProperties(path: string, method = 'GET'): string[] {
  const endpoint = baseline.endpoints.find(
    (candidate) => candidate.path === path && candidate.method === method,
  )
  if (endpoint === undefined) {
    throw new Error(`consumer baseline has no ${method} ${path}`)
  }
  return [...endpoint.responseProperties].sort()
}

const ASSET_SAMPLE: Asset = {
  id: '00000000-0000-4000-8000-000000000050',
  assetNumber: 'AST-2026-0001',
  serialNumber: 'SN-889900',
  materialId: '00000000-0000-4000-8000-000000000024',
  materialCode: 'IT-HW-PC-001',
  materialNameAr: 'حاسوب مكتبي',
  warehouseId: '00000000-0000-4000-8000-000000000030',
  warehouseCode: 'WH-CENTRAL',
  warehouseName: 'المستودع المركزي',
  currentStatus: 'InStock',
  activeCustodyId: null,
  holderType: null,
  holderId: null,
  acquisitionDate: '2026-08-21',
  warrantyExpiry: null,
  rowVersion: 1,
}

const ASSET_DETAILS_SAMPLE: AssetDetails = {
  ...ASSET_SAMPLE,
  materialNameEn: 'Desktop Computer',
  custodyKind: 'Personal',
  latestMovementType: 'Issued',
  latestMovementAtUtc: '2026-08-21T10:00:00.000Z',
  receiptLineId: '00000000-0000-4000-8000-000000000061',
  receiptDocumentId: '00000000-0000-4000-8000-000000000060',
  receiptDocumentReference: 'EIAMS-RCV-2026-0001',
}

const ASSET_CURRENT_STATUS_SAMPLE: AssetCurrentStatusInfo = {
  assetId: ASSET_SAMPLE.id,
  materialId: ASSET_SAMPLE.materialId,
  warehouseId: ASSET_SAMPLE.warehouseId,
  assetNumber: ASSET_SAMPLE.assetNumber,
  serialNumber: ASSET_SAMPLE.serialNumber,
  currentStatus: 'InCustody',
  activeCustodyId: '00000000-0000-4000-8000-000000000051',
  holderType: 'Employee',
  holderId: '00000000-0000-4000-8000-000000000015',
  custodyKind: 'Personal',
  latestMovementType: 'Returned',
  latestMovementAtUtc: '2026-08-21T10:00:00.000Z',
}

const ASSET_MOVEMENT_SAMPLE: AssetMovement = {
  id: '00000000-0000-4000-8000-000000000052',
  assetId: ASSET_SAMPLE.id,
  documentId: '00000000-0000-4000-8000-000000000060',
  documentReferenceNumber: 'EIAMS-RCV-2026-0001',
  documentType: 'Receiving',
  movementType: 'Received',
  movedAtUtc: '2026-08-21T10:00:00.000Z',
}

const ASSET_CUSTODY_TIMELINE_SAMPLE: AssetCustodyTimelineRow = {
  custodyId: '00000000-0000-4000-8000-000000000053',
  assetId: ASSET_SAMPLE.id,
  holderType: 'OrganizationalUnit',
  holderId: '00000000-0000-4000-8000-000000000020',
  custodyKind: 'Operational',
  issueDocumentId: '00000000-0000-4000-8000-000000000060',
  returnDocumentId: null,
  status: 'Active',
  fromUtc: '2026-08-21T08:00:00.000Z',
  toUtc: null,
  rowVersion: 1,
}

describe('asset wire contract', () => {
  it('declares exactly the live Asset response properties', () => {
    expect(Object.keys(ASSET_SAMPLE).sort()).toEqual(responseProperties('/assets'))
  })

  it('declares exactly the live AssetDetails response properties', () => {
    expect(Object.keys(ASSET_DETAILS_SAMPLE).sort()).toEqual(
      responseProperties('/assets/{assetId}'),
    )
  })

  it('declares exactly the live AssetCurrentStatus response properties', () => {
    expect(Object.keys(ASSET_CURRENT_STATUS_SAMPLE).sort()).toEqual(
      responseProperties('/assets/{assetId}/current-status'),
    )
  })

  it('declares exactly the live AssetMovement response properties', () => {
    expect(Object.keys(ASSET_MOVEMENT_SAMPLE).sort()).toEqual(
      responseProperties('/assets/{assetId}/movements'),
    )
  })

  it('declares exactly the live AssetCustodyTimeline response properties', () => {
    expect(Object.keys(ASSET_CUSTODY_TIMELINE_SAMPLE).sort()).toEqual(
      responseProperties('/assets/{assetId}/custody-timeline'),
    )
  })
})
