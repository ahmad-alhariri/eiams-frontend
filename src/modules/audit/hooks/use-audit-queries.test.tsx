import { QueryClientProvider } from '@tanstack/react-query'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { server } from '@/test/msw/server'
import type { AuditLogDetail, AuditLogHeader } from '@/modules/audit/types/audit.api-types'

import { useAuditLogQuery, useAuditLogsQuery } from './use-audit-queries'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

/** The LIVE list row (`AuditLogListItemResponse`). */
const HEADER: AuditLogHeader = {
  id: '11111111-1111-4111-8111-111111111111',
  operationId: '22222222-2222-4222-8222-222222222222',
  requestId: '5b3a5b4a-6f0e-4c0a-9a3a-9d1f0f6c2b11',
  userId: null,
  entityType: 'WarehouseDocument',
  entityId: '33333333-3333-4333-8333-333333333333',
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

function createWrapper() {
  const client = createQueryClient()
  function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { client, wrapper: QueryWrapper }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('audit query hooks', () => {
  it('reads scoped, server-paginated audit headers', async () => {
    let requestedQuery = ''
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requestedQuery = new URL(request.url).search
        return okPageJson([HEADER])
      }),
    )

    const { wrapper } = createWrapper()
    const { result } = renderHook(
      () =>
        useAuditLogsQuery({
          page: 1,
          pageSize: 10,
          entityId: HEADER.entityId,
          entityType: HEADER.entityType,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.items[0]?.id).toBe(HEADER.id)
    // The wire page is ONE-based; the snapshot's `pageIndex` is never sent.
    expect(new URLSearchParams(requestedQuery).get('page')).toBe('1')
    expect(new URLSearchParams(requestedQuery).get('pageSize')).toBe('10')
    expect(new URLSearchParams(requestedQuery).has('pageIndex')).toBe(false)
  })

  it('stays disabled until the session scope is ready', () => {
    activeScope.key = undefined
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () => {
        throw new Error('no audit request should fire without an active scope')
      }),
    )

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useAuditLogsQuery(), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('reads one redacted audit detail by exact id', async () => {
    const auditLog: AuditLogDetail = {
      ...HEADER,
      summary: null,
      isSummaryRedacted: false,
      summaryRedactionReason: null,
      ipAddress: '::1',
      entries: [],
    }
    server.use(http.get(`${API_BASE_URL}/audit-logs/${auditLog.id}`, () => okJson(auditLog)))

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useAuditLogQuery(auditLog.id), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.id).toBe(auditLog.id)
  })

  it('keeps a redacted value out of the query cache and out of the query key', async () => {
    const auditLog: AuditLogDetail = {
      ...HEADER,
      summary: null,
      isSummaryRedacted: false,
      summaryRedactionReason: null,
      ipAddress: '::1',
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
      ],
    }
    server.use(http.get(`${API_BASE_URL}/audit-logs/${auditLog.id}`, () => okJson(auditLog)))

    const { client, wrapper } = createWrapper()
    const { result } = renderHook(() => useAuditLogQuery(auditLog.id), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())

    const cachedData = client
      .getQueryCache()
      .getAll()
      .map((query) => query.state.data)
    const cachedKeys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)
    expect(JSON.stringify(cachedData)).not.toContain('old secret')
    expect(JSON.stringify(cachedData)).not.toContain('new secret')
    expect(JSON.stringify(cachedKeys)).not.toContain('old secret')
    expect(JSON.stringify(cachedKeys)).not.toContain('new secret')
  })
})
