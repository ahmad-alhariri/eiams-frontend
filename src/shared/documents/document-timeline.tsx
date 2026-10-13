import { StatusBadge } from '@/shared/feedback/status-badge'
import type {
  DocumentLifecycleEvent,
  DocumentStatus,
} from '@/shared/documents/types/document-wire.types'
import { cn } from '@/shared/utils/class-names'
import { formatDateTime } from '@/shared/utils/format'

/**
 * The action vocabulary `DocumentLifecycleSaveChangesInterceptor` records.
 * It is NOT the policy action vocabulary: the interceptor maps a status
 * transition onto a past-tense event name, and `Rejected → Draft` is recorded as
 * `RevisionStarted` (there is no `Revise` event, because the revise ROUTE is not
 * what happens to the document — the status is). Spelled here rather than
 * imported so the timeline cannot drift onto a policy action name.
 */
type LifecycleEventType =
  | 'Created'
  | 'Submitted'
  | 'Posted'
  | 'Rejected'
  | 'RevisionStarted'
  | 'Cancelled'
  | 'Reversed'

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

/**
 * Fallback title for an action the interceptor has added since this file was
 * written. The dot colour falls back with it, so an unknown event is still
 * visible and still ordered — it is never dropped from the chain, because the
 * chain is the audit evidence and a missing row would be a lie.
 */
const UNKNOWN_EVENT_TITLE = 'حدث على الوثيقة'
const UNKNOWN_EVENT_DOT_CLASS = 'bg-muted-foreground'

function eventTypeOf(action: string): LifecycleEventType | null {
  return action in EVENT_TITLE ? (action as LifecycleEventType) : null
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
  return first !== undefined && last !== undefined && first.occurredAtUtc >= last.occurredAtUtc
}

function TimelineEventRow({ event, isLast }: { event: DocumentLifecycleEvent; isLast: boolean }) {
  const eventType = eventTypeOf(event.action)
  const title = eventType === null ? UNKNOWN_EVENT_TITLE : EVENT_TITLE[eventType]
  const dotClass = eventType === null ? UNKNOWN_EVENT_DOT_CLASS : EVENT_DOT_CLASS[eventType]
  // The real history response carries the actor as a display name only — there is
  // no role reference on the event, so the line states the actor and nothing the
  // server did not send.
  const actorLine = `بواسطة ${event.actorDisplayName}`

  return (
    <li data-event-action={event.action} className="relative flex gap-3">
      <div aria-hidden className="flex w-3 flex-col items-center">
        <span className={cn('mt-1.5 size-3 shrink-0 rounded-full', dotClass)} />
        {!isLast ? <span className="my-1 w-0.5 flex-1 bg-antique-sand" /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <StatusBadge entity="document" status={event.toStatus} />
        </div>
        <time dateTime={event.occurredAtUtc} className="text-xs text-muted-foreground">
          {formatDateTime(event.occurredAtUtc)}
        </time>
        <p className="text-sm text-foreground">{actorLine}</p>
        {event.reason === null || event.reason === '' ? null : (
          <p className="text-sm text-muted-foreground">{event.reason}</p>
        )}
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
        <h3 className="text-lg font-semibold text-foreground">
          {titleAr}
        </h3>
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