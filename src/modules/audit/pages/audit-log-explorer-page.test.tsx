import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { createAuditLog, createPage } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import AuditLogExplorerPage from './audit-log-explorer-page'

const API_BASE_URL = '/api/v1'

function createWrapper(options: { retry?: false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: options.retry === false ? false : 1 } },
  })

  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('AuditLogExplorerPage', () => {
  it('renders immutable Arabic audit headers with fixed server chronology and a detail link', async () => {
    const auditLog = createAuditLog()
    let requestQuery: Record<string, string> | undefined
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requestQuery = Object.fromEntries(new URL(request.url).searchParams)
        return HttpResponse.json(createPage([auditLog], { totalItems: 11, totalPages: 2 }))
      }),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سجل التدقيق' }),
    ).toBeInTheDocument()
    await screen.findByText('تم تحديث السند.')
    expect(screen.getByText('تحديث')).toBeInTheDocument()
    expect(screen.getByText(auditLog.entityDisplay ?? '')).toBeInTheDocument()
    expect(screen.getByText(auditLog.occurredBy.displayName)).toBeInTheDocument()
    expect(screen.getByText(auditLog.summaryAr ?? '')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'عرض تفاصيل سجل التدقيق 00000000…' })).toHaveAttribute(
      'href',
      `/audit?auditLogId=${auditLog.auditLogId}`,
    )
    expect(requestQuery).toMatchObject({ pageIndex: '0', pageSize: '10' })
    expect(requestQuery).not.toHaveProperty('sortBy')
    expect(requestQuery).not.toHaveProperty('sortDirection')
  })

  it('renders an unratified action as its raw contract code instead of guessing an Arabic label', async () => {
    const auditLog = createAuditLog({ action: 'ResetSession' })
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () => HttpResponse.json(createPage([auditLog]))),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('ResetSession')).toHaveClass('text-muted-foreground')
    expect(screen.queryByText('إعادة تعيين الجلسة')).not.toBeInTheDocument()
  })

  it('forwards only supported server filters and resets pagination after a filter change', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(createPage([createAuditLog()], { totalItems: 21, totalPages: 3 }))
      }),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })
    await screen.findByText('تم تحديث السند.')
    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(requests.at(-1)?.['pageIndex']).toBe('1'))

    fireEvent.change(screen.getByLabelText('تصفية حسب نوع السجل'), {
      target: { value: 'WarehouseDocument' },
    })
    fireEvent.change(screen.getByLabelText('تصفية حسب معرّف السجل'), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    })
    fireEvent.change(screen.getByLabelText('من تاريخ الحدث'), {
      target: { value: '2026-08-01T08:30' },
    })
    fireEvent.change(screen.getByLabelText('إلى تاريخ الحدث'), {
      target: { value: '2026-08-02T08:30' },
    })

    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({
        pageIndex: '0',
        entityType: 'WarehouseDocument',
        entityId: '11111111-1111-4111-8111-111111111111',
        dateFrom: expect.stringMatching(/^2026-08-01T.*Z$/),
        dateTo: expect.stringMatching(/^2026-08-02T.*Z$/),
      }),
    )
  })

  it('uses the shared debounced visible-text search without adding client sorting', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json(createPage([createAuditLog()]))
      }),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })
    await screen.findByText('تم تحديث السند.')
    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), 'السند')

    await waitFor(() => expect(requests.at(-1)?.['search']).toBe('السند'))
    expect(
      screen.queryByRole('button', { name: /وقت الحدث|الإجراء|السجل المتأثر/ }),
    ).not.toBeInTheDocument()
  })

  it('renders accessible Arabic error and empty states and retries the immutable list read', async () => {
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([]))
      }),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper({ retry: false }) })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل سجل التدقيق' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByRole('heading', { name: 'لا توجد عمليات تدقيق' })).toBeInTheDocument()
    expect(attempts).toBe(2)
  })
})
