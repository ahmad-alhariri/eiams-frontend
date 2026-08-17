import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLifecycleEvent } from '@/test/msw/factories'
import { createWarehouseDocumentHistoryHandler } from '@/test/msw/warehouse-document-handlers'
import { server } from '@/test/msw/server'

import DocumentTimelineSection from './document-timeline-section'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000002bc'

const HISTORY_EVENTS = [
  createLifecycleEvent({
    documentId: DOCUMENT_ID,
    documentRowVersion: 1,
    eventType: 'Created',
    occurredAt: '2026-01-01T08:00:00.000Z',
    occurredBy: { displayName: 'أحمد علي', roleNameAr: 'أمين المستودع' },
    toStatus: 'Draft',
  }),
  createLifecycleEvent({
    documentId: DOCUMENT_ID,
    documentRowVersion: 2,
    eventType: 'Posted',
    occurredAt: '2026-01-02T09:30:00.000Z',
    toStatus: 'Posted',
  }),
]

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('DocumentTimelineSection', () => {
  it('renders the fetched lifecycle events with Arabic titles, status badge, and actor line', async () => {
    server.use(...createWarehouseDocumentHistoryHandler(HISTORY_EVENTS))

    render(<DocumentTimelineSection documentId={DOCUMENT_ID} />, { wrapper: createWrapper() })

    expect(await screen.findByText('إنشاء الوثيقة')).toBeInTheDocument()
    expect(screen.getByText('ترحيل الوثيقة')).toBeInTheDocument()
    expect(screen.getByText('بواسطة أحمد علي — أمين المستودع')).toBeInTheDocument()
    expect(screen.getByText('سجل الحالة')).toBeInTheDocument()
    expect(screen.getAllByText('مرحّل').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-slot="document-timeline-section"]')).not.toBeNull()
  })

  it('shows a loading spinner while the history request is pending', async () => {
    server.use(...createWarehouseDocumentHistoryHandler(HISTORY_EVENTS, { delayMs: 400 }))

    render(<DocumentTimelineSection documentId={DOCUMENT_ID} />, { wrapper: createWrapper() })

    expect(await screen.findByText('جارٍ تحميل سجل دورة حياة السند...')).toBeInTheDocument()
    expect(await screen.findByText('إنشاء الوثيقة')).toBeInTheDocument()
  })

  it('renders the Arabic error state and retries the failed history request', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({
              documentId: DOCUMENT_ID,
              currentStatus: 'Posted',
              currentRowVersion: 2,
              events: HISTORY_EVENTS,
            })
      }),
    )

    render(<DocumentTimelineSection documentId={DOCUMENT_ID} />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل سجل دورة الحياة' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('إنشاء الوثيقة')).toBeInTheDocument()
  })

  it('renders nothing and fires no request when documentId is null', () => {
    let calls = 0

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () => {
        calls += 1
        return new HttpResponse(null, { status: 404 })
      }),
    )

    const { container } = render(<DocumentTimelineSection documentId={null} />, {
      wrapper: createWrapper(),
    })

    expect(container).toBeEmptyDOMElement()
    expect(calls).toBe(0)
  })
})
