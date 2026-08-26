import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { DocumentTimeline } from '@/shared/documents/document-timeline'
import type { DocumentLifecycleEvent } from '@/shared/types/generated/eiams-v1'
import { formatDateTime } from '@/shared/utils/format'

function buildEvent(
  overrides: Partial<DocumentLifecycleEvent> &
    Pick<DocumentLifecycleEvent, 'eventType' | 'occurredAt'>,
): DocumentLifecycleEvent {
  return {
    documentId: '00000000-0000-0000-0000-000000000001',
    documentRowVersion: 1,
    eventId: '00000000-0000-0000-0000-0000000000a1',
    occurredBy: {
      displayName: 'أحمد علي',
      roleNameAr: 'أمين مستودع',
      userId: '00000000-0000-0000-0000-000000000002',
    },
    toStatus: 'Draft',
    ...overrides,
  }
}

describe('DocumentTimeline event rendering', () => {
  it('renders all seven lifecycle event types with their Arabic titles', () => {
    render(
      <DocumentTimeline
        events={[
          buildEvent({ eventType: 'Created', occurredAt: '2026-08-09T08:00:00.000Z' }),
          buildEvent({ eventType: 'Submitted', occurredAt: '2026-08-09T09:00:00.000Z' }),
          buildEvent({ eventType: 'Posted', occurredAt: '2026-08-09T11:30:00.000Z' }),
          buildEvent({ eventType: 'Rejected', occurredAt: '2026-08-10T08:00:00.000Z' }),
          buildEvent({ eventType: 'RevisionStarted', occurredAt: '2026-08-10T09:00:00.000Z' }),
          buildEvent({ eventType: 'Cancelled', occurredAt: '2026-08-11T08:00:00.000Z' }),
          buildEvent({ eventType: 'Reversed', occurredAt: '2026-08-11T10:00:00.000Z' }),
        ]}
      />,
    )

    expect(screen.getByText('إنشاء الوثيقة')).toBeInTheDocument()
    expect(screen.getByText('إرسال للترحيل')).toBeInTheDocument()
    expect(screen.getByText('ترحيل الوثيقة')).toBeInTheDocument()
    expect(screen.getByText('رفض الوثيقة')).toBeInTheDocument()
    expect(screen.getByText('بدء المراجعة')).toBeInTheDocument()
    expect(screen.getByText('إلغاء الوثيقة')).toBeInTheDocument()
    expect(screen.getByText('عكس الوثيقة')).toBeInTheDocument()
  })

  it('renders the actor, role, and Arabic-formatted date per event', () => {
    const occurredAt = '2026-08-09T10:30:00.000Z'
    render(
      <DocumentTimeline
        events={[
          buildEvent({
            eventType: 'Created',
            occurredAt,
            occurredBy: {
              displayName: 'أحمد علي',
              roleNameAr: 'أمين مستودع',
              userId: '00000000-0000-0000-0000-000000000002',
            },
          }),
        ]}
      />,
    )

    expect(screen.getByText('بواسطة أحمد علي — أمين مستودع')).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(occurredAt))).toHaveAttribute('datetime', occurredAt)
  })

  it('omits the role from the actor line when roleNameAr is absent', () => {
    render(
      <DocumentTimeline
        events={[
          buildEvent({
            eventType: 'Submitted',
            occurredAt: '2026-08-09T09:00:00.000Z',
            occurredBy: {
              displayName: 'أحمد علي',
              userId: '00000000-0000-0000-0000-000000000002',
            },
          }),
        ]}
      />,
    )

    expect(screen.getByText('بواسطة أحمد علي')).toBeInTheDocument()
    expect(screen.queryByText(/—/)).not.toBeInTheDocument()
  })

  it('renders the authorized reason as muted note text', () => {
    render(
      <DocumentTimeline
        events={[
          buildEvent({
            eventType: 'Rejected',
            occurredAt: '2026-08-09T09:20:00.000Z',
            reason: 'صورة التوقيع المطلوبة غير مرفقة بالمستند الأصلي.',
          }),
        ]}
      />,
    )

    expect(screen.getByText('صورة التوقيع المطلوبة غير مرفقة بالمستند الأصلي.')).toHaveClass(
      'text-muted-foreground',
    )
  })

  it.each([
    ['Receiving', 'استلام', '/documents/receiving/00000000-0000-0000-0000-0000000000c1'],
    ['Issue', 'صرف', '/documents/issue/00000000-0000-0000-0000-0000000000c1'],
    ['Transfer', 'تحويل', '/documents/transfer/00000000-0000-0000-0000-0000000000c1'],
    ['Opening', 'رصيد افتتاحي', '/documents/opening/00000000-0000-0000-0000-0000000000c1'],
    ['Return', 'إرجاع', '/documents/return/00000000-0000-0000-0000-0000000000c1'],
  ] as const)(
    'renders the server-returned %s related-document reference as an accessible detail link',
    (documentType, labelAr, href) => {
      render(
        <MemoryRouter>
          <DocumentTimeline
            events={[
              buildEvent({
                eventType: 'Reversed',
                occurredAt: '2026-08-10T09:45:00.000Z',
                relatedDocument: {
                  documentId: '00000000-0000-0000-0000-0000000000c1',
                  documentType,
                  status: 'Posted',
                  systemReferenceNumber: 'ISS-2026-000742',
                },
              }),
            ]}
          />
        </MemoryRouter>,
      )

      expect(screen.getByText(labelAr)).toBeInTheDocument()
      expect(screen.getByText('ISS-2026-000742')).toHaveAttribute('dir', 'ltr')
      expect(
        screen.getByRole('link', { name: `فتح تفاصيل سند ${labelAr}: ISS-2026-000742` }),
      ).toHaveAttribute('href', href)
    },
  )

  it('routes an Adjustment reference with its authoritative adjustmentId', () => {
    render(
      <MemoryRouter>
        <DocumentTimeline
          events={[
            buildEvent({
              eventType: 'Reversed',
              occurredAt: '2026-08-10T09:45:00.000Z',
              relatedDocument: {
                adjustmentId: '00000000-0000-0000-0000-0000000000a9',
                documentId: '00000000-0000-0000-0000-0000000000c1',
                documentType: 'Adjustment',
                status: 'Posted',
                systemReferenceNumber: 'ADJ-2026-000742',
              },
            }),
          ]}
        />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('link', { name: 'فتح تفاصيل سند تسوية: ADJ-2026-000742' }),
    ).toHaveAttribute('href', '/adjustments/00000000-0000-0000-0000-0000000000a9')
  })

  it('does not infer an Adjustment route from documentId when adjustmentId is absent', () => {
    render(
      <MemoryRouter>
        <DocumentTimeline
          events={[
            buildEvent({
              eventType: 'Reversed',
              occurredAt: '2026-08-10T09:45:00.000Z',
              relatedDocument: {
                documentId: '00000000-0000-0000-0000-0000000000c1',
                documentType: 'Adjustment',
                status: 'Posted',
                systemReferenceNumber: 'ADJ-2026-000743',
              },
            }),
          ]}
        />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('note', { name: 'سند تسوية مرتبط: ADJ-2026-000743' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('DocumentTimeline structure and resilience', () => {
  it('shows the Arabic empty state and the default title when no events exist', () => {
    render(<DocumentTimeline events={[]} />)

    expect(screen.getByText('سجل الحالة')).toBeInTheDocument()
    expect(screen.getByText('لا توجد أحداث بعد')).toHaveClass('text-muted-foreground')
  })

  it('renders an accessible ordered list and flips newest-first input to chronological order', () => {
    const { container } = render(
      <DocumentTimeline
        events={[
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a4',
            eventType: 'Reversed',
            occurredAt: '2026-08-09T12:00:00.000Z',
            toStatus: 'Reversed',
          }),
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a3',
            eventType: 'Posted',
            occurredAt: '2026-08-09T11:00:00.000Z',
          }),
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a2',
            eventType: 'Submitted',
            occurredAt: '2026-08-09T10:00:00.000Z',
          }),
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a1',
            eventType: 'Created',
            occurredAt: '2026-08-09T09:00:00.000Z',
          }),
        ]}
        status="Reversed"
        titleAr="سجل تتبع الوثيقة"
      />,
    )

    expect(screen.getByRole('list')).toBeInTheDocument()
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('إنشاء الوثيقة')
    expect(items[items.length - 1]).toHaveTextContent('عكس الوثيقة')
    expect(screen.getByText('سجل تتبع الوثيقة')).toBeInTheDocument()
    expect(screen.getAllByText('معكوس')).toHaveLength(2)
  })

  it('tags every event row with its contract event type for styling hooks', () => {
    const { container } = render(
      <DocumentTimeline
        events={[
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a5',
            eventType: 'Created',
            occurredAt: '2026-08-09T08:00:00.000Z',
          }),
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a6',
            eventType: 'Posted',
            occurredAt: '2026-08-09T11:30:00.000Z',
          }),
        ]}
      />,
    )

    const rows = container.querySelectorAll('[data-event-type]')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('data-event-type', 'Created')
    expect(rows[1]).toHaveAttribute('data-event-type', 'Posted')
  })
})
