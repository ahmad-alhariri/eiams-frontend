import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import type {
  AuditLogDetail,
  AuditLogEntry,
  AuditLogHeader,
} from '@/modules/audit/types/audit.api-types'

/**
 * Drift gate between the handwritten AUDIT wire contract and the LIVE
 * consumer baseline.
 *
 * The sibling of the custody / inventory / asset gates: the sample values
 * below are annotated with the declared types, so a field added to or removed
 * from an interface fails to compile, and the runtime assertion then compares
 * the property names to the committed baseline captured from the live API.
 *
 * The baseline records RESPONSE properties only, so the field-diff entry — the
 * nested `AuditLogEntryResponse` — is pinned here against the live DTO
 * (`Application.AuditLogs.AuditLogEntryResponse`, verified on the live swagger
 * on 2026-10-26).
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
        'It is tracked in git; restore it rather than letting the wire gate silently skip.',
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

const HEADER_SAMPLE: AuditLogHeader = {
  id: '00000000-0000-4000-8000-0000000000c8',
  operationId: '00000000-0000-4000-8000-0000000000c9',
  requestId: '5b3a5b4a-6f0e-4c0a-9a3a-9d1f0f6c2b11',
  userId: null,
  entityType: 'WarehouseDocument',
  entityId: '00000000-0000-4000-8000-0000000000ca',
  aggregateType: null,
  aggregateId: null,
  action: 'Update',
  commandName: 'PostDocumentCommand',
  createdAtUtc: '2026-08-20T10:00:00.000Z',
  actionDisplayAr: 'تعديل',
  actionDisplayEn: 'Update',
  entityTypeDisplayAr: 'مستند مستودعي',
  entityTypeDisplayEn: 'WarehouseDocument',
}

const ENTRY_SAMPLE: AuditLogEntry = {
  id: '00000000-0000-4000-8000-0000000000cb',
  fieldName: 'totalAmount',
  oldValue: '1200.00',
  newValue: '1500.00',
  isRedacted: false,
  redactionReason: null,
  fieldDisplayAr: 'المبلغ الإجمالي',
  fieldDisplayEn: 'Total Amount',
}

const DETAIL_SAMPLE: AuditLogDetail = {
  ...HEADER_SAMPLE,
  summary: 'تم تحديث السند.',
  isSummaryRedacted: false,
  summaryRedactionReason: null,
  ipAddress: '::1',
  entries: [ENTRY_SAMPLE],
}

describe('audit wire contract', () => {
  it('declares exactly the live audit list row properties', () => {
    expect(Object.keys(HEADER_SAMPLE).sort()).toEqual(responseProperties('/audit-logs'))
  })

  it('declares exactly the live audit detail properties', () => {
    expect(Object.keys(DETAIL_SAMPLE).sort()).toEqual(
      responseProperties('/audit-logs/{auditLogId}'),
    )
  })

  it('declares exactly the live field-diff entry properties', () => {
    // `Application.AuditLogs.AuditLogEntryResponse`: Id, FieldName, OldValue,
    // NewValue, IsRedacted, RedactionReason, FieldDisplayAr, FieldDisplayEn.
    expect(Object.keys(ENTRY_SAMPLE).sort()).toEqual([
      'fieldDisplayAr',
      'fieldDisplayEn',
      'fieldName',
      'id',
      'isRedacted',
      'newValue',
      'oldValue',
      'redactionReason',
    ])
  })
})
