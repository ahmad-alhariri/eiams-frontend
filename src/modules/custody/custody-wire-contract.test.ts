import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import type {
  AssignAssetCustodyRequest,
  Custody,
  CustodyAssignmentCreated,
  PendingCustody,
  TransferCustodyRequest,
} from '@/modules/custody/types/custody.types'

/**
 * Drift gate between the handwritten CUSTODY wire contract and the LIVE
 * consumer baseline.
 *
 * The sibling half of the asset gate: the sample values below are annotated
 * with the declared types, so a field added to or removed from an interface
 * fails to compile, and the runtime assertion then compares the property names
 * to the committed baseline captured from the live API.
 *
 * The two mutation REQUEST bodies are asserted here too: the baseline records
 * response properties only, so the request shape is pinned against the live
 * controller contract (verified in `src/Web.Api/Controllers/Custodies/`).
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

const CUSTODY_SAMPLE: Custody = {
  subjectType: 'Asset',
  subjectId: '00000000-0000-4000-8000-000000000050',
  custodyId: '00000000-0000-4000-8000-000000000053',
  materialId: '00000000-0000-4000-8000-000000000024',
  materialNameAr: 'حاسوب مكتبي',
  materialNameEn: 'Desktop Computer',
  materialCode: 'IT-HW-PC-001',
  materialKind: 'Asset',
  trackingType: 'Serial',
  serialNumber: 'SN-889900',
  assetNumber: 'AST-2026-0001',
  warehouseId: '00000000-0000-4000-8000-000000000030',
  warehouseName: 'المستودع المركزي',
  holderType: 'Employee',
  holderId: '00000000-0000-4000-8000-000000000015',
  holderDisplayName: 'محمد السيد',
  custodyKind: 'Personal',
  issuedQuantity: 1,
  activeQuantity: 1,
  returnedQuantity: 0,
  issueDocumentId: '00000000-0000-4000-8000-000000000060',
  systemReferenceNumber: 'ISSUE-2026-0001',
  status: 'Active',
  fromUtc: '2026-08-21T08:00:00.000Z',
  toUtc: null,
  rowVersion: 1,
}

const PENDING_CUSTODY_SAMPLE: PendingCustody = {
  custodyId: '00000000-0000-4000-8000-000000000053',
  assetId: '00000000-0000-4000-8000-000000000050',
  assetNumber: 'AST-2026-0001',
  materialId: '00000000-0000-4000-8000-000000000024',
  holderType: 'OrganizationalUnit',
  holderId: '00000000-0000-4000-8000-000000000020',
  issueDocumentId: '00000000-0000-4000-8000-000000000060',
  fromUtc: '2026-08-21T08:00:00.000Z',
  rowVersion: 1,
}

const ASSIGNMENT_CREATED_SAMPLE: CustodyAssignmentCreated = {
  id: '00000000-0000-4000-8000-000000000054',
}

const ASSIGN_REQUEST_SAMPLE: AssignAssetCustodyRequest = {
  employeeId: '00000000-0000-4000-8000-000000000015',
  expectedCustodyRowVersion: 1,
  note: 'تكليف شخصي',
}

const TRANSFER_REQUEST_SAMPLE: TransferCustodyRequest = {
  subjectType: 'Asset',
  newHolderType: 'Employee',
  newHolderId: '00000000-0000-4000-8000-000000000015',
  newCustodyKind: 'Operational',
  expectedRowVersion: 1,
  note: 'تحويل المسؤولية',
}

describe('custody wire contract', () => {
  it('declares exactly the live Custody response properties', () => {
    expect(Object.keys(CUSTODY_SAMPLE).sort()).toEqual(responseProperties('/custodies'))
  })

  it('declares exactly the live PendingCustody response properties', () => {
    expect(Object.keys(PENDING_CUSTODY_SAMPLE).sort()).toEqual(
      responseProperties('/custodies/pending'),
    )
  })

  it('declares exactly the live custody-assignment response properties', () => {
    expect(Object.keys(ASSIGNMENT_CREATED_SAMPLE).sort()).toEqual(
      responseProperties('/assets/{assetId}/custody-assignment', 'POST'),
    )
  })

  it('declares a transfer that answers with no payload, like the live controller', () => {
    expect(responseProperties('/custodies/{custodyId}/transfer', 'POST')).toEqual([])
  })

  it('declares the assign request body the live controller accepts', () => {
    // `AssignAssetCustodyController.RequestBody`: EmployeeId,
    // ExpectedCustodyRowVersion, Note — and nothing else.
    expect(Object.keys(ASSIGN_REQUEST_SAMPLE).sort()).toEqual([
      'employeeId',
      'expectedCustodyRowVersion',
      'note',
    ])
  })

  it('declares the transfer request body the live controller accepts', () => {
    // `TransferCustodyController.TransferCustodyRequest`: SubjectType,
    // NewHolderType, NewHolderId, NewCustodyKind, ExpectedRowVersion, Note.
    expect(Object.keys(TRANSFER_REQUEST_SAMPLE).sort()).toEqual([
      'expectedRowVersion',
      'newCustodyKind',
      'newHolderId',
      'newHolderType',
      'note',
      'subjectType',
    ])
  })
})
