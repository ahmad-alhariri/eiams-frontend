import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/test/msw/server'

import { createAuditService } from './audit.service'
import { normalizeError } from '@/shared/services/api.client'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createAuditService(bundle.client)
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('AuditService', () => {
  it('forwards supported list filters while retaining headers only in client projections', async () => {
    const service = setupService()
    const auditLog = {
      auditLogId: '00000000-0000-4000-8000-0000000000c8',
      entityId: '00000000-0000-4000-8000-0000000000c8',
      entityType: 'WarehouseDocument',
      entityDisplay: 'سند تجريبي',
      action: 'Update',
      occurredAt: '2026-08-15T10:00:00.000Z',
      occurredBy: { id: '00000000-0000-4000-8000-00000000000a', displayName: 'مدقق تجريبي' },
      summaryAr: 'تم تحديث السند.',
      entries: [
        {
          entryId: '00000000-0000-4000-8000-0000000000d0',
          fieldName: 'status',
          oldValue: 'Draft',
          newValue: 'Submitted',
          redacted: false,
          redactionReasonAr: null,
        },
      ],
      traceId: 'audit-trace-1',
    }
    let requestedQuery = ''

    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requestedQuery = new URL(request.url).search
        return HttpResponse.json({ items: [auditLog], meta: { page: 1, pageIndex: 1, pageSize: 25, itemCount: 1, totalItems: 1, totalCount: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false } })
      }),
    )

    const page = await service.listAuditLogs({
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-31T23:59:59.000Z',
      entityId: auditLog.entityId,
      entityType: auditLog.entityType,
      pageIndex: 2,
      pageSize: 25,
      search: 'سند',
    })

    expect(requestedQuery).toContain('entityType=WarehouseDocument')
    expect(requestedQuery).toContain('entityId=00000000-0000-4000-8000-0000000000c8')
    expect(requestedQuery).toContain('pageIndex=2')
    expect(page.items[0]?.entries).toEqual([])
  })

  it('removes malformed raw values from redacted detail entries before callers can cache them', async () => {
    const service = setupService()
    const auditLog = {
      auditLogId: '00000000-0000-4000-8000-0000000000c8',
      entityId: '00000000-0000-4000-8000-0000000000c8',
      entityType: 'WarehouseDocument',
      entityDisplay: 'سند تجريبي',
      action: 'Update',
      occurredAt: '2026-08-15T10:00:00.000Z',
      occurredBy: { id: '00000000-0000-4000-8000-00000000000a', displayName: 'مدقق تجريبي' },
      summaryAr: 'تم تحديث السند.',
      entries: [
        {
          entryId: 'redacted-entry',
          fieldName: 'secret',
          oldValue: 'old secret',
          newValue: 'new secret',
          redacted: true,
          redactionReasonAr: 'بيانات حساسة',
        },
        {
          entryId: 'visible-entry',
          fieldName: 'status',
          oldValue: 'Draft',
          newValue: 'Submitted',
          redacted: false,
          redactionReasonAr: null,
        },
      ],
      traceId: 'audit-trace-2',
    }

    server.use(
      http.get(`${API_BASE_URL}/audit-logs/00000000-0000-4000-8000-0000000000c8`, () =>
        HttpResponse.json(auditLog),
      ),
    )

    const detail = await service.getAuditLog('00000000-0000-4000-8000-0000000000c8')
    const hiddenEntry = detail.entries[0]

    expect(hiddenEntry).toMatchObject({
      entryId: 'redacted-entry',
      redacted: true,
      redactionReasonAr: 'بيانات حساسة',
    })
    expect(hiddenEntry).not.toHaveProperty('oldValue')
    expect(hiddenEntry).not.toHaveProperty('newValue')
    expect(detail.entries[1]).toMatchObject({ oldValue: 'Draft', newValue: 'Submitted' })
  })

  it('encodes audit identifiers and preserves server errors for Arabic presentation handling', async () => {
    const service = setupService()

    server.use(
      http.get(`${API_BASE_URL}/audit-logs/id%2F1`, () =>
        HttpResponse.json(
          {
            status: 404,
            code: 'audit.log.not_found',
            titleAr: 'سجل التدقيق غير موجود',
            detailAr: 'تعذر العثور على سجل التدقيق.',
          },
          { status: 404 },
        ),
      ),
    )

    const error = await service.getAuditLog('id/1').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeError(error)).toMatchObject({
      code: 'audit.log.not_found',
      detailAr: 'تعذر العثور على سجل التدقيق.',
      status: 404,
      titleAr: 'سجل التدقيق غير موجود',
    })
  })
})
