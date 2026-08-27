import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { createAuditLog, createAuditLogEntry } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import AuditLogExplorerPage from '../pages/audit-log-explorer-page'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const AUDIT_LOG_ID = '11111111-1111-4111-8111-111111111111'

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
    const auditLog = createAuditLog({
      auditLogId: AUDIT_LOG_ID,
      action: 'Update',
      entityDisplay: 'سند استلام ٤٢',
      summaryAr: 'تم تحديث السند.',
      entries: [
        createAuditLogEntry({
          fieldName: 'totalAmount',
          oldValue: '1200.00',
          newValue: '1500.00',
          redacted: false,
        }),
        createAuditLogEntry({
          fieldName: 'supplierContractNo',
          oldValue: 'CONF-9981',
          newValue: 'CONF-9982',
          redacted: true,
          redactionReasonAr: 'قيمة محجوبة لارتباطها بعقد سرّي.',
        }),
      ],
    })

    server.use(
      http.get(`${API_BASE_URL}/audit-logs/${AUDIT_LOG_ID}`, () => HttpResponse.json(auditLog)),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'تفاصيل سجل التدقيق' })).toBeInTheDocument()
    expect(await screen.findByText('سند استلام ٤٢')).toBeInTheDocument()
    expect(screen.getByText('تم تحديث السند.')).toBeInTheDocument()

    // Non-redacted diff shows the real values (LTR data).
    expect(screen.getByText('1200.00')).toBeInTheDocument()
    expect(screen.getByText('1500.00')).toBeInTheDocument()

    // Redacted entry MUST show the fixed placeholder, never the raw contract value.
    expect(screen.getAllByText('قيمة محجوبة').length).toBeGreaterThan(0)
    expect(screen.queryByText('CONF-9981')).not.toBeInTheDocument()
    expect(screen.queryByText('CONF-9982')).not.toBeInTheDocument()
    expect(screen.getByText('قيمة محجوبة لارتباطها بعقد سرّي.')).toBeInTheDocument()
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
    const auditLog = createAuditLog({
      auditLogId: AUDIT_LOG_ID,
      entries: [createAuditLogEntry({ fieldName: 'note', oldValue: 'قديم', newValue: 'جديد' })],
    })
    server.use(
      http.get(`${API_BASE_URL}/audit-logs/${AUDIT_LOG_ID}`, () => HttpResponse.json(auditLog)),
    )

    render(<AuditLogExplorerPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'تفاصيل سجل التدقيق' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'العودة إلى السجل' })).toBeInTheDocument()
  })
})
