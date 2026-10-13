import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DocumentTimeline } from '@/shared/documents/document-timeline'
import type { DocumentLifecycleEvent } from '@/shared/documents/types/document-wire.types'
import { formatDateTime } from '@/shared/utils/format'

/**
 * The wire event is `{ eventId, fromStatus, toStatus, action, reason, actorUserId,
 * actorDisplayName, occurredAtUtc, resultingRowVersion, requestId, operationId }`.
 *
 * Two snapshot members the old suite asserted are simply not on it:
 * - `occurredBy.roleNameAr` — the actor arrives as a display name only, so the
 *   row states the actor and nothing the server did not send;
 * - `relatedDocument` — the compensating document is reached from the DETAIL read
 *   (`reversalOfDocumentId` / `reversedByDocumentId`), not from a timeline row,
 *   so the row renders no link at all.
 */

function buildEvent(
  overrides: Partial<DocumentLifecycleEvent> &
    Pick<DocumentLifecycleEvent, 'action' | 'occurredAtUtc'>,
): DocumentLifecycleEvent {
  return {
    eventId: '00000000-0000-0000-0000-0000000000a1',
    fromStatus: null,
    resultingRowVersion: 1,
    actorUserId: '00000000-0000-0000-0000-000000000002',
    actorDisplayName: 'أحمد علي',
    requestId: null,
    operationId: '00000000-0000-0000-0000-0000000000ff',
    reason: null,
    toStatus: 'Draft',
    ...overrides,
  }
}

describe('DocumentTimeline event rendering', () => {
  it('renders all seven lifecycle action types with their Arabic titles', () => {
    render(
      <DocumentTimeline
        events={[
          buildEvent({ action: 'Created', occurredAtUtc: '2026-08-09T08:00:00.000Z' }),
          buildEvent({ action: 'Submitted', occurredAtUtc: '2026-08-09T09:00:00.000Z' }),
          buildEvent({ action: 'Posted', occurredAtUtc: '2026-08-09T11:30:00.000Z' }),
          buildEvent({ action: 'Rejected', occurredAtUtc: '2026-08-10T08:00:00.000Z' }),
          buildEvent({ action: 'RevisionStarted', occurredAtUtc: '2026-08-10T09:00:00.000Z' }),
          buildEvent({ action: 'Cancelled', occurredAtUtc: '2026-08-11T08:00:00.000Z' }),
          buildEvent({ action: 'Reversed', occurredAtUtc: '2026-08-11T10:00:00.000Z' }),
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

  it('falls back to a neutral Arabic title for an action it has never heard of', () => {
    // The chain is the audit evidence, so an unknown action is still shown and
    // still ordered rather than dropped.
    render(
      <DocumentTimeline
        events={[
          buildEvent({
            action: 'Escalated',
            occurredAtUtc: '2026-08-09T08:00:00.000Z',
            toStatus: 'Submitted',
          }),
        ]}
      />,
    )

    expect(screen.getByText('حدث على الوثيقة')).toBeInTheDocument()
  })

  it('renders the actor display name and the Arabic-formatted date per event', () => {
    const occurredAtUtc = '2026-08-09T10:30:00.000Z'
    render(
      <DocumentTimeline
        events={[
          buildEvent({
            action: 'Created',
            occurredAtUtc,
            actorDisplayName: 'أحمد علي',
          }),
        ]}
      />,
    )

    expect(screen.getByText('بواسطة أحمد علي')).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(occurredAtUtc))).toHaveAttribute(
      'datetime',
      occurredAtUtc,
    )
  })

  it('states the actor alone — the wire event carries no role reference', () => {
    render(
      <DocumentTimeline
        events={[buildEvent({ action: 'Submitted', occurredAtUtc: '2026-08-09T09:00:00.000Z' })]}
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
            action: 'Rejected',
            occurredAtUtc: '2026-08-09T09:20:00.000Z',
            reason: 'صورة التوقيع المطلوبة غير مرفقة بالمستند الأصلي.',
          }),
        ]}
      />,
    )

    expect(screen.getByText('صورة التوقيع المطلوبة غير مرفقة بالمستند الأصلي.')).toHaveClass(
      'text-muted-foreground',
    )
  })

  it('renders no related-document link: the wire event carries none', () => {
    // The snapshot's `relatedDocument` is gone from the history read. The
    // compensating document is reachable from the DETAIL read instead, through
    // `reversalOfDocumentId` / `reversedByDocumentId`, so a timeline row must
    // render no navigation the server did not send.
    render(
      <DocumentTimeline
        events={[
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a9',
            action: 'Reversed',
            occurredAtUtc: '2026-08-10T09:45:00.000Z',
            toStatus: 'Reversed',
          }),
        ]}
      />,
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
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
            action: 'Reversed',
            occurredAtUtc: '2026-08-09T12:00:00.000Z',
            toStatus: 'Reversed',
          }),
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a3',
            action: 'Posted',
            occurredAtUtc: '2026-08-09T11:00:00.000Z',
          }),
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a2',
            action: 'Submitted',
            occurredAtUtc: '2026-08-09T10:00:00.000Z',
          }),
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a1',
            action: 'Created',
            occurredAtUtc: '2026-08-09T09:00:00.000Z',
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

  it('tags every event row with the contract action for styling hooks', () => {
    const { container } = render(
      <DocumentTimeline
        events={[
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a5',
            action: 'Created',
            occurredAtUtc: '2026-08-09T08:00:00.000Z',
          }),
          buildEvent({
            eventId: '00000000-0000-0000-0000-0000000000a6',
            action: 'Posted',
            occurredAtUtc: '2026-08-09T11:30:00.000Z',
          }),
        ]}
      />,
    )

    const rows = container.querySelectorAll('[data-event-action]')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('data-event-action', 'Created')
    expect(rows[1]).toHaveAttribute('data-event-action', 'Posted')
  })
})
