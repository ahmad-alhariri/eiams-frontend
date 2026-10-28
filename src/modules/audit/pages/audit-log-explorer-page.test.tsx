import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { server } from '@/test/msw/server'
import type { AuditLogHeader } from '@/modules/audit/types/audit.api-types'
import { formatDateTime } from '@/shared/utils/format'
import { formatArabicDate } from '@/shared/ui/calendar-utils'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import AuditLogExplorerPage from './audit-log-explorer-page'

const API_BASE_URL = '/api/v1'

/** The LIVE list row (`AuditLogListItemResponse`). */
const HEADER: AuditLogHeader = {
  id: '00000000-0000-4000-8000-0000000000c8',
  operationId: '00000000-0000-4000-8000-0000000000c9',
  requestId: '5b3a5b4a-6f0e-4c0a-9a3a-9d1f0f6c2b11',
  userId: '44444444-4444-4444-8444-444444444444',
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
    let requestQuery: Record<string, string> | undefined
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requestQuery = Object.fromEntries(new URL(request.url).searchParams)
        return okPageJson([HEADER], { page: 1, pageSize: 20, totalCount: 11, totalPages: 2 })
      }),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سجل التدقيق' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('تعديل')).toBeInTheDocument()
    expect(screen.getByText('00000000…')).toBeInTheDocument()
    expect(screen.getByText('44444444…')).toBeInTheDocument()
    expect(screen.getByText('PostDocumentCommand')).toBeInTheDocument()
    // The row is named by what it shows, not by a truncated audit log id.
    expect(
      screen.getByRole('link', {
        name: `عرض تفاصيل سجل التدقيق: تعديل — WarehouseDocument ${HEADER.entityId} — ${formatDateTime(HEADER.createdAtUtc)}`,
      }),
    ).toHaveAttribute('href', `/audit?auditLogId=${HEADER.id}`)
    // The wire page is ONE-based; the snapshot's `pageIndex` is never sent.
    expect(requestQuery).toMatchObject({ page: '1', pageSize: '10' })
    expect(requestQuery).not.toHaveProperty('pageIndex')
    expect(requestQuery).not.toHaveProperty('sortBy')
    expect(requestQuery).not.toHaveProperty('sortDirection')
  })

  it('gives every row a distinct accessible name built from what the row shows', async () => {
    const second: AuditLogHeader = {
      ...HEADER,
      id: '00000000-0000-4000-8000-0000000000d9',
      action: 'Authenticate',
      actionDisplayAr: 'تسجيل دخول',
      entityType: 'User',
      entityId: '44444444-4444-4444-8444-444444444444',
      createdAtUtc: '2026-08-21T11:30:00.000Z',
    }
    server.use(http.get(`${API_BASE_URL}/audit-logs`, () => okPageJson([HEADER, second])))

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    const first = await screen.findByRole('link', { name: /تعديل/u })
    const other = await screen.findByRole('link', { name: /تسجيل دخول/u })

    expect(first).toHaveAccessibleName(
      `عرض تفاصيل سجل التدقيق: تعديل — WarehouseDocument ${HEADER.entityId} — ${formatDateTime(HEADER.createdAtUtc)}`,
    )
    expect(other).toHaveAccessibleName(
      `عرض تفاصيل سجل التدقيق: تسجيل دخول — User ${second.entityId} — ${formatDateTime(second.createdAtUtc)}`,
    )
    expect(first.getAttribute('aria-label')).not.toBe(other.getAttribute('aria-label'))
  })

  it('renders an unratified action as its raw contract code instead of guessing an Arabic label', async () => {
    const auditLog: AuditLogHeader = { ...HEADER, action: 'ResetSession', actionDisplayAr: null }
    server.use(http.get(`${API_BASE_URL}/audit-logs`, () => okPageJson([auditLog])))

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
        return okPageJson([HEADER], {
          page: 1,
          pageSize: 20,
          totalCount: 21,
          totalPages: 3,
        })
      }),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })
    await screen.findByText('تعديل')

    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'من تاريخ الإنشاء' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(requests.at(-1)?.['page']).toBe('2'))

    fireEvent.change(screen.getByLabelText('تصفية حسب نوع السجل'), {
      target: { value: 'WarehouseDocument' },
    })
    fireEvent.change(screen.getByLabelText('تصفية حسب معرّف السجل'), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    })
    const today = new Date()
    const postedOn = new Date(today.getFullYear(), today.getMonth(), 1)
    const toOn = new Date(today.getFullYear(), today.getMonth(), 2)
    await user.click(screen.getByRole('button', { name: 'من تاريخ الإنشاء' }))
    await user.click(screen.getByRole('button', { name: formatArabicDate(postedOn) }))
    await user.click(screen.getByRole('button', { name: 'إلى تاريخ الإنشاء' }))
    await user.click(screen.getByRole('button', { name: formatArabicDate(toOn) }))

    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({
        page: '1',
        entityType: 'WarehouseDocument',
        entityId: '11111111-1111-4111-8111-111111111111',
        fromUtc: postedOn.toISOString(),
        toUtc: toOn.toISOString(),
      }),
    )
    // The names the backend does not bind must never reach the wire.
    expect(requests.at(-1)).not.toHaveProperty('pageIndex')
    expect(requests.at(-1)).not.toHaveProperty('dateFrom')
    expect(requests.at(-1)).not.toHaveProperty('dateTo')
  })

  it('uses the shared debounced visible-text search without adding client sorting', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([HEADER])
      }),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })
    await screen.findByText('تعديل')
    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), 'السند')

    await waitFor(() => expect(requests.at(-1)?.['search']).toBe('السند'))
    expect(
      screen.queryByRole('button', { name: /^(تاريخ الإنشاء|الإجراء|السجل المتأثر)$/ }),
    ).not.toBeInTheDocument()
  })

  it('renders accessible Arabic error and empty states and retries the immutable list read', async () => {
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okPageJson([])
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

  // eiams-frontend-er89 / am5m. The server refuses a half-filled range
  // (`DateRangeLimits.IsValid`) with a 400 the list cannot explain, and the
  // explorer used to send it while the user was still filling the other bound.
  it('never sends a half-filled date range and names the missing bound inline', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([HEADER])
      }),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })
    await screen.findByText('تعديل')

    const today = new Date()
    const postedOn = new Date(today.getFullYear(), today.getMonth(), 1)
    await user.click(screen.getByRole('button', { name: 'من تاريخ الإنشاء' }))
    await user.click(screen.getByRole('button', { name: formatArabicDate(postedOn) }))

    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(requests.every((query) => !('fromUtc' in query) && !('toUtc' in query))).toBe(true)

    // The Arabic message sits on the filter the user still has to fill.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('حدّد «من تاريخ الإنشاء» و«إلى تاريخ الإنشاء» معًا.')
    expect(screen.getByRole('button', { name: 'إلى تاريخ الإنشاء' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByRole('button', { name: /^من تاريخ الإنشاء/ })).not.toHaveAttribute(
      'aria-invalid',
    )
  })

  it('never sends an inverted date range and says which bound has to move', async () => {
    const user = userEvent.setup()
    const requests: Record<string, string>[] = []
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams))
        return okPageJson([HEADER])
      }),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })
    await screen.findByText('تعديل')

    const today = new Date()
    const later = new Date(today.getFullYear(), today.getMonth(), 20)
    const earlier = new Date(today.getFullYear(), today.getMonth(), 10)
    await user.click(screen.getByRole('button', { name: 'من تاريخ الإنشاء' }))
    await user.click(screen.getByRole('button', { name: formatArabicDate(later) }))
    await user.click(screen.getByRole('button', { name: 'إلى تاريخ الإنشاء' }))
    await user.click(screen.getByRole('button', { name: formatArabicDate(earlier) }))

    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(requests.every((query) => !('fromUtc' in query) && !('toUtc' in query))).toBe(true)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('يجب أن يكون «إلى تاريخ الإنشاء» بعد «من تاريخ الإنشاء».')
    expect(screen.getByRole('button', { name: /إلى تاريخ الإنشاء/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  // eiams-frontend-050j / 919b. The column and the filters read `createdAtUtc`
  // — the CREATION time — so they must not claim to be an event time.
  it('labels the created-at column and both date filters with the creation-time wording', async () => {
    server.use(http.get(`${API_BASE_URL}/audit-logs`, () => okPageJson([HEADER])))

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })
    await screen.findByText('تعديل')

    expect(screen.getByRole('columnheader', { name: 'تاريخ الإنشاء' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'من تاريخ الإنشاء' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إلى تاريخ الإنشاء' })).toBeInTheDocument()
    expect(screen.queryByText(/وقت الحدث|تاريخ الحدث/)).not.toBeInTheDocument()
  })
})
