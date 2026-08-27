import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createAuditLog,
  createAuditLogEntry,
  createPage,
  createProblemDetails,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import { createAuditService } from './audit.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createAuditService(bundle.client)
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

describe('AuditService', () => {
  it('forwards supported list filters while retaining headers only in client projections', async () => {
    const service = setupService()
    const auditLog = createAuditLog({
      entries: [
        createAuditLogEntry({
          newValue: 'new secret',
          oldValue: 'old secret',
          redacted: true,
        }),
      ],
    })
    let requestedQuery = ''

    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requestedQuery = new URL(request.url).search
        return HttpResponse.json(createPage([auditLog]))
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
    const auditLog = createAuditLog({
      entries: [
        createAuditLogEntry({
          entryId: 'redacted-entry',
          newValue: 'new secret',
          oldValue: 'old secret',
          redacted: true,
          redactionReasonAr: 'بيانات حساسة',
        }),
        createAuditLogEntry({
          entryId: 'visible-entry',
          newValue: 'Submitted',
          oldValue: 'Draft',
          redacted: false,
        }),
      ],
    })

    server.use(
      http.get(`${API_BASE_URL}/audit-logs/${auditLog.auditLogId}`, () =>
        HttpResponse.json(auditLog),
      ),
    )

    const detail = await service.getAuditLog(auditLog.auditLogId)
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
    const problem = createProblemDetails({
      code: 'audit.log.not_found',
      detailAr: 'تعذر العثور على سجل التدقيق.',
      status: 404,
      titleAr: 'سجل التدقيق غير موجود',
    })

    server.use(
      http.get(`${API_BASE_URL}/audit-logs/id%2F1`, () =>
        HttpResponse.json(problem, { status: 404 }),
      ),
    )

    const error = await service.getAuditLog('id/1').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      code: 'audit.log.not_found',
      detailAr: 'تعذر العثور على سجل التدقيق.',
      status: 404,
      titleAr: 'سجل التدقيق غير موجود',
    })
  })
})
