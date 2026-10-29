import { createAxiosTransport } from '@/shared/api/axios-transport'
import axios from 'axios'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

import { createAuditService } from './audit.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import type { AuditLogDetail, AuditLogHeader } from '@/modules/audit/types/audit.api-types'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createAuditService(createAxiosTransport(bundle.client))
}

/**
 * The LIVE list row (`AuditLogListItemResponse`).
 *
 * Handwritten here rather than taken from the shared factory: the factory
 * still answers with the frozen snapshot's shape (`auditLogId`, `occurredAt`,
 * `occurredBy`), which the server never sends.
 */
const HEADER: AuditLogHeader = {
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

/** The LIVE detail (`AuditLogDetailsResponse`) with one redacted field. */
function detailWith(overrides: Partial<AuditLogDetail> = {}): AuditLogDetail {
  return {
    ...HEADER,
    summary: 'تم تحديث السند.',
    isSummaryRedacted: false,
    summaryRedactionReason: null,
    ipAddress: '::1',
    entries: [],
    ...overrides,
  }
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

describe('AuditService', () => {
  it('sends the parameter names the backend binds', async () => {
    const service = setupService()
    let requestedQuery = ''

    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requestedQuery = new URL(request.url).search
        return okPageJson([HEADER])
      }),
    )

    await service.listAuditLogs({
      page: 2,
      pageSize: 25,
      entityId: HEADER.entityId,
      entityType: HEADER.entityType,
      fromUtc: '2026-08-01T00:00:00.000Z',
      toUtc: '2026-08-31T23:59:59.000Z',
      search: 'سند',
    })

    const requested = new URLSearchParams(requestedQuery)
    // `PaginationQueryParameters.Page` and `GetAuditLogsRequest.FromUtc/ToUtc`.
    expect(requested.get('page')).toBe('2')
    expect(requested.get('pageSize')).toBe('25')
    expect(requested.get('fromUtc')).toBe('2026-08-01T00:00:00.000Z')
    expect(requested.get('toUtc')).toBe('2026-08-31T23:59:59.000Z')
    expect(requested.get('entityType')).toBe('WarehouseDocument')
    expect(requested.get('entityId')).toBe(HEADER.entityId)
    expect(requested.get('search')).toBe('سند')
    // The names the server does NOT bind must never reach the wire: they were
    // silently dropped server-side, which pinned every list to page 1 and made
    // the date range filter a no-op.
    expect(requested.has('pageIndex')).toBe(false)
    expect(requested.has('dateFrom')).toBe(false)
    expect(requested.has('dateTo')).toBe(false)
  })

  it('reads the list as headers only, so no field value reaches the cache', async () => {
    const service = setupService()
    server.use(http.get(`${API_BASE_URL}/audit-logs`, () => okPageJson([HEADER])))

    const page = await service.listAuditLogs({ page: 1, pageSize: 10 })

    expect(page.items).toEqual([HEADER])
    expect(page.totalItems).toBe(1)
    expect(page.page).toBe(1)
  })

  it('removes a redacted value from the detail before the caller can cache it', async () => {
    const service = setupService()
    // A leaky server: the entry claims to be redacted and still carries the
    // secret. The service must not pass it on.
    const leaky = detailWith({
      entries: [
        {
          id: 'redacted-entry',
          fieldName: 'passwordHash',
          oldValue: 'old secret',
          newValue: 'new secret',
          isRedacted: true,
          redactionReason: 'CONFIDENTIAL_CREDENTIAL',
          fieldDisplayAr: 'passwordHash',
          fieldDisplayEn: 'passwordHash',
        },
        {
          id: 'visible-entry',
          fieldName: 'status',
          oldValue: 'Draft',
          newValue: 'Submitted',
          isRedacted: false,
          redactionReason: null,
          fieldDisplayAr: 'الحالة',
          fieldDisplayEn: 'Status',
        },
      ],
    })

    server.use(http.get(`${API_BASE_URL}/audit-logs/${HEADER.id}`, () => okJson(leaky)))

    const detail = await service.getAuditLog(HEADER.id)
    const hiddenEntry = detail.entries[0]

    expect(hiddenEntry).toMatchObject({
      id: 'redacted-entry',
      isRedacted: true,
      redactionReason: 'CONFIDENTIAL_CREDENTIAL',
      oldValue: null,
      newValue: null,
    })
    expect(JSON.stringify(detail)).not.toContain('old secret')
    expect(JSON.stringify(detail)).not.toContain('new secret')
    expect(detail.entries[1]).toMatchObject({ oldValue: 'Draft', newValue: 'Submitted' })
  })

  it('removes a redacted summary before the caller can cache it', async () => {
    const service = setupService()
    const leaky = detailWith({
      summary: '{"password":"secret"}',
      isSummaryRedacted: true,
      summaryRedactionReason: 'CONFIDENTIAL_CREDENTIAL',
    })

    server.use(http.get(`${API_BASE_URL}/audit-logs/${HEADER.id}`, () => okJson(leaky)))

    const detail = await service.getAuditLog(HEADER.id)

    expect(detail.summary).toBeNull()
    expect(JSON.stringify(detail)).not.toContain('secret')
  })

  it('encodes audit identifiers and preserves server errors for Arabic presentation handling', async () => {
    const service = setupService()
    server.use(
      http.get(`${API_BASE_URL}/audit-logs/id%2F1`, () =>
        errJson(404, { code: 'AUDIT_LOGS_NOT_FOUND', message: 'Audit log not found.' }),
      ),
    )

    const error = await service.getAuditLog('id/1').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      code: 'AUDIT_LOGS_NOT_FOUND',
      status: 404,
      titleAr: 'لم يتم العثور على سجل التدقيق.',
    })
  })
})
