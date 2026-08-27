import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAuditLog, createPage } from '@/test/msw/factories'
import { createQueryClient } from '@/shared/services/query.client'
import { server } from '@/test/msw/server'

import { useAuditLogQuery, useAuditLogsQuery } from './use-audit-queries'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('audit query hooks', () => {
  it('reads scoped, server-paginated audit headers without caching list detail entries', async () => {
    const auditLog = createAuditLog()
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () => HttpResponse.json(createPage([auditLog]))),
    )

    const { result } = renderHook(
      () => useAuditLogsQuery({ entityId: auditLog.entityId, entityType: auditLog.entityType }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.items[0]?.entries).toEqual([])
  })

  it('stays disabled until the session scope is ready', () => {
    activeScope.key = undefined
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () => {
        throw new Error('no audit request should fire without an active scope')
      }),
    )

    const { result } = renderHook(() => useAuditLogsQuery(), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('reads one redacted audit detail by exact id', async () => {
    const auditLog = createAuditLog({ auditLogId: '11111111-1111-4111-8111-111111111111' })
    server.use(
      http.get(`${API_BASE_URL}/audit-logs/${auditLog.auditLogId}`, () =>
        HttpResponse.json(auditLog),
      ),
    )

    const { result } = renderHook(() => useAuditLogQuery(auditLog.auditLogId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.auditLogId).toBe(auditLog.auditLogId)
  })
})
