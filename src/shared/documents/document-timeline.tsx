import { IconFileText } from '@tabler/icons-react'

import { StatusBadge } from '@/shared/feedback/status-badge'
import type {
  DocumentLifecycleEvent,
  DocumentStatus,
  DocumentType,
  LifecycleDocumentReference,
  LifecycleEventType,
} from '@/shared/types/generated/eiams-v1'
import { cn } from '@/shared/utils/class-names'
import { formatDateTime } from '@/shared/utils/format'

const EVENT_TITLE: Record<LifecycleEventType, string> = {
  Created: 'إنشاء الوثيقة',
  Submitted: 'إرسال للترحيل',
  Posted: 'ترحيل الوثيقة',
  Rejected: 'رفض الوثيقة',
  RevisionStarted: 'بدء المراجعة',
  Cancelled: 'إلغاء الوثيقة',
  Reversed: 'عكس الوثيقة',
}

const EVENT_DOT_CLASS: Record<LifecycleEventType, string> = {
  Created: 'bg-golden-wheat',
  Submitted: 'bg-accent',
  Posted: 'bg-primary',
  Rejected: 'bg-critical',
  RevisionStarted: 'bg-golden-wheat',
  Cancelled: 'bg-destructive',
  Reversed: 'border-2 border-muted-foreground bg-background',
}

const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  Receiving: 'استلام',
  Issue: 'صرف',
  Transfer: 'تحويل',
  Adjustment: 'تسوية',
  Opening: 'رصيد افتتاحي',
  Return: 'إرجاع',
}

const DEFAULT_TITLE = 'سجل الحالة'
const EMPTY_MESSAGE = 'لا توجد أحداث بعد'

export type DocumentTimelineProps = {
  /** Immutable lifecycle events from the server, oldest- or newest-first; rendering is chronological either way. */
  events: readonly DocumentLifecycleEvent[]
  /** Authoritative current document status, rendered as a header badge. */
  status?: DocumentStatus
  titleAr?: string
  className?: string
}

function isNewestFirst(events: readonly DocumentLifecycleEvent[]) {
  if (events.length < 2) return false
  const first = events[0]
  const last = events[events.length - 1]
  return first !== undefined && last !== undefined && first.occurredAt >= last.occurredAt
}

function RelatedDocumentChip({ reference }: { reference: LifecycleDocumentReference }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-4xl border border-antique-sand bg-muted/50 px-3 py-1 text-xs text-foreground">
      <IconFileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="font-medium">
        {DOCUMENT_TYPE_LABEL[reference.documentType] ?? reference.documentType}
      </span>
      <span dir="ltr" className="font-english text-muted-foreground">
        {reference.systemReferenceNumber}
      </span>
    </span>
  )
}

function TimelineEventRow({ event, isLast }: { event: DocumentLifecycleEvent; isLast: boolean }) {
  const actor = event.occurredBy
  const actorLine = actor.roleNameAr
    ? `بواسطة ${actor.displayName} — ${actor.roleNameAr}`
    : `بواسطة ${actor.displayName}`

  return (
    <li data-event-type={event.eventType} className="relative flex gap-3">
      <div aria-hidden className="flex w-3 flex-col items-center">
        <span
          className={cn('mt-1.5 size-3 shrink-0 rounded-full', EVENT_DOT_CLASS[event.eventType])}
        />
        {!isLast ? <span className="my-1 w-0.5 flex-1 bg-antique-sand" /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {EVENT_TITLE[event.eventType]}
          </span>
          <StatusBadge entity="document" status={event.toStatus} />
        </div>
        <time dateTime={event.occurredAt} className="text-xs text-muted-foreground">
          {formatDateTime(event.occurredAt)}
        </time>
        <p className="text-sm text-foreground">{actorLine}</p>
        {event.reason ? <p className="text-sm text-muted-foreground">{event.reason}</p> : null}
        {event.relatedDocument ? <RelatedDocumentChip reference={event.relatedDocument} /> : null}
      </div>
    </li>
  )
}

function DocumentTimeline({
  events,
  status,
  titleAr = DEFAULT_TITLE,
  className,
}: DocumentTimelineProps) {
  const orderedEvents = isNewestFirst(events) ? [...events].reverse() : [...events]

  return (
    <section data-slot="document-timeline" className={cn('flex flex-col gap-3', className)}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-foreground">{titleAr}</h3>
        {status ? <StatusBadge entity="document" status={status} /> : null}
      </header>
      {orderedEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY_MESSAGE}</p>
      ) : (
        <ol className="flex flex-col">
          {orderedEvents.map((event, index) => (
            <TimelineEventRow
              key={event.eventId}
              event={event}
              isLast={index === orderedEvents.length - 1}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

export { DocumentTimeline }
