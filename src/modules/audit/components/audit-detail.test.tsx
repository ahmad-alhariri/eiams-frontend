import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { okJson } from '@/test/msw/envelope'
import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { server } from '@/test/msw/server'
import type { AuditLogDetail } from '@/modules/audit/types/audit.api-types'

import AuditLogExplorerPage from '../pages/audit-log-explorer-page'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const AUDIT_LOG_ID = '11111111-1111-4111-8111-111111111111'

/** The LIVE detail (`AuditLogDetailsResponse`). */
function detail(overrides: Partial<AuditLogDetail> = {}): AuditLogDetail {
  return {
    id: AUDIT_LOG_ID,
    operationId: '22222222-2222-4222-8222-222222222222',
    requestId: '5b3a5b4a-6f0e-4c0a-9a3a-9d1f0f6c2b11',
    userId: '44444444-4444-4444-8444-444444444444',
    entityType: 'WarehouseDocument',
    entityId: '33333333-3333-4333-8333-333333333333',
    aggregateType: null,
    aggregateId: null,
    action: 'Update',
    commandName: 'PostDocumentCommand',
    summary: 'تم تحديث السند.',
    isSummaryRedacted: false,
    summaryRedactionReason: null,
    ipAddress: '::1',
    createdAtUtc: '2026-08-20T10:00:00.000Z',
    entries: [],
    actionDisplayAr: 'تعديل',
    actionDisplayEn: 'Update',
    entityTypeDisplayAr: 'مستند مستودعي',
    entityTypeDisplayEn: 'WarehouseDocument',
    ...overrides,
  }
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[`/audit?auditLogId=${AUDIT_LOG_ID}`]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('AuditDetail', () => {
  it('renders the audit operation header and a server-redacted entry as the fixed placeholder', async () => {
    const auditLog = detail({
      entries: [
        {
          id: 'visible-entry',
          fieldName: 'totalAmount',
          oldValue: '1200.00',
          newValue: '1500.00',
          isRedacted: false,
          redactionReason: null,
          fieldDisplayAr: 'المبلغ الإجمالي',
          fieldDisplayEn: 'Total Amount',
        },
        {
          id: 'redacted-entry',
          fieldName: 'supplierContractNo',
          oldValue: 'CONF-9981',
          newValue: 'CONF-9982',
          isRedacted: true,
          redactionReason: 'CONFIDENTIAL_CREDENTIAL',
          fieldDisplayAr: 'supplierContractNo',
          fieldDisplayEn: 'supplierContractNo',
        },
      ],
    })

    server.use(http.get(`${API_BASE_URL}/audit-logs/${AUDIT_LOG_ID}`, () => okJson(auditLog)))

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'تفاصيل سجل التدقيق' })).toBeInTheDocument()
    expect(await screen.findByText('تم تحديث السند.')).toBeInTheDocument()
    expect(screen.getByText('تعديل')).toBeInTheDocument()

    // Non-redacted diff shows the real values (LTR data).
    expect(screen.getByText('1200.00')).toBeInTheDocument()
    expect(screen.getByText('1500.00')).toBeInTheDocument()

    // Redacted entry MUST show the fixed placeholder, never the raw contract value.
    expect(screen.getAllByText('قيمة محجوبة').length).toBeGreaterThan(0)
    expect(screen.queryByText('CONF-9981')).not.toBeInTheDocument()
    expect(screen.queryByText('CONF-9982')).not.toBeInTheDocument()
    expect(screen.getByText('القيمة محجوبة لارتباطها ببيانات اعتماد سرية.')).toHaveClass(
      'text-warning',
    )

    // eiams-frontend-050j / 919b. The field is `createdAtUtc` — the CREATION
    // time — so the detail must not label it as an event time.
    expect(screen.getByText('تاريخ الإنشاء')).toBeInTheDocument()
    expect(screen.queryByText('وقت الحدث')).not.toBeInTheDocument()
  })

  it('never renders a redacted value even when the server leaks one', async () => {
    const auditLog = detail({
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
    })

    server.use(http.get(`${API_BASE_URL}/audit-logs/${AUDIT_LOG_ID}`, () => okJson(auditLog)))

    const { container } = render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'تفاصيل سجل التدقيق' })).toBeInTheDocument()
    expect(await screen.findByText('passwordHash')).toBeInTheDocument()
    expect(screen.getAllByText('قيمة محجوبة').length).toBeGreaterThan(0)
    expect(container.textContent).not.toContain('old secret')
    expect(container.textContent).not.toContain('new secret')
  })

  it('renders an actionable Arabic error state when the detail request fails', async () => {
    server.use(
      http.get(
        `${API_BASE_URL}/audit-logs/${AUDIT_LOG_ID}`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل سجل التدقيق' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  })

  it('offers a back link that returns to the immutable audit list', async () => {
    const auditLog = detail({
      entries: [
        {
          id: 'visible-entry',
          fieldName: 'note',
          oldValue: 'قديم',
          newValue: 'جديد',
          isRedacted: false,
          redactionReason: null,
          fieldDisplayAr: 'ملاحظة',
          fieldDisplayEn: 'Note',
        },
      ],
    })
    server.use(http.get(`${API_BASE_URL}/audit-logs/${AUDIT_LOG_ID}`, () => okJson(auditLog)))

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'تفاصيل سجل التدقيق' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'العودة إلى السجل' })).toBeInTheDocument()
  })
})
