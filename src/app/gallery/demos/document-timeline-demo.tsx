import type { GallerySection } from '@/app/gallery/gallery-sections'
import { DocumentTimeline } from '@/shared/documents/document-timeline'
import type { DocumentLifecycleEvent } from '@/shared/documents/types/document-wire.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

const KEEPER_ID = '00000000-0000-0000-0000-000000000201'
const KEEPER_2_ID = '00000000-0000-0000-0000-000000000202'
const MANAGER_ID = '00000000-0000-0000-0000-000000000203'

/**
 * The real history response carries the actor as a display name plus an optional
 * user id — there is no role reference on the event, so the timeline states the
 * actor and nothing more.
 */
const keeper = {
  displayName: 'أحمد علي',
  userId: KEEPER_ID,
}
const keeper2 = {
  displayName: 'سارة الخطيب',
  userId: KEEPER_2_ID,
}
const manager = {
  displayName: 'ماجد الحلبي',
  userId: MANAGER_ID,
}

const reversedReceivingEvents: DocumentLifecycleEvent[] = [
  {
    eventId: '00000000-0000-0000-0000-000000000301',
    fromStatus: null,
    action: 'Created',
    reason: null,
    actorUserId: KEEPER_ID,
    actorDisplayName: keeper.displayName,
    occurredAtUtc: '2026-08-09T08:00:00.000Z',
    resultingRowVersion: 1,
    requestId: 'req-0001',
    operationId: '00000000-0000-0000-0000-000000000901',
    toStatus: 'Draft',
  },
  {
    eventId: '00000000-0000-0000-0000-000000000302',
    fromStatus: 'Draft',
    action: 'Submitted',
    reason: null,
    actorUserId: KEEPER_ID,
    actorDisplayName: keeper.displayName,
    occurredAtUtc: '2026-08-09T09:15:00.000Z',
    resultingRowVersion: 2,
    requestId: 'req-0002',
    operationId: '00000000-0000-0000-0000-000000000902',
    toStatus: 'Submitted',
  },
  {
    eventId: '00000000-0000-0000-0000-000000000303',
    fromStatus: 'Submitted',
    action: 'Posted',
    reason: null,
    actorUserId: MANAGER_ID,
    actorDisplayName: manager.displayName,
    occurredAtUtc: '2026-08-09T11:30:00.000Z',
    resultingRowVersion: 3,
    requestId: 'req-0003',
    operationId: '00000000-0000-0000-0000-000000000903',
    toStatus: 'Posted',
  },
  {
    eventId: '00000000-0000-0000-0000-000000000304',
    fromStatus: 'Posted',
    action: 'Reversed',
    reason: 'خطأ حسابي في الكميات المسجلة؛ تم العكس عبر مستند صرف تعويضي.',
    actorUserId: MANAGER_ID,
    actorDisplayName: manager.displayName,
    occurredAtUtc: '2026-08-10T09:45:00.000Z',
    resultingRowVersion: 4,
    requestId: 'req-0004',
    operationId: '00000000-0000-0000-0000-000000000904',
    toStatus: 'Reversed',
  },
]

const rejectedThenPostedIssueEvents: DocumentLifecycleEvent[] = [
  {
    eventId: '00000000-0000-0000-0000-000000000401',
    fromStatus: null,
    action: 'Created',
    reason: null,
    actorUserId: KEEPER_2_ID,
    actorDisplayName: keeper2.displayName,
    occurredAtUtc: '2026-08-05T07:15:00.000Z',
    resultingRowVersion: 1,
    requestId: 'req-0005',
    operationId: '00000000-0000-0000-0000-000000000905',
    toStatus: 'Draft',
  },
  {
    eventId: '00000000-0000-0000-0000-000000000402',
    fromStatus: 'Draft',
    action: 'Submitted',
    reason: null,
    actorUserId: KEEPER_2_ID,
    actorDisplayName: keeper2.displayName,
    occurredAtUtc: '2026-08-05T08:05:00.000Z',
    resultingRowVersion: 2,
    requestId: 'req-0006',
    operationId: '00000000-0000-0000-0000-000000000906',
    toStatus: 'Submitted',
  },
  {
    eventId: '00000000-0000-0000-0000-000000000403',
    fromStatus: 'Submitted',
    action: 'Rejected',
    reason: 'صورة التوقيع المطلوبة غير مرفقة بالمستند الأصلي.',
    actorUserId: MANAGER_ID,
    actorDisplayName: manager.displayName,
    occurredAtUtc: '2026-08-05T09:20:00.000Z',
    resultingRowVersion: 3,
    requestId: 'req-0007',
    operationId: '00000000-0000-0000-0000-000000000907',
    toStatus: 'Rejected',
  },
  {
    eventId: '00000000-0000-0000-0000-000000000404',
    fromStatus: 'Rejected',
    action: 'RevisionStarted',
    reason: null,
    actorUserId: KEEPER_2_ID,
    actorDisplayName: keeper2.displayName,
    occurredAtUtc: '2026-08-05T10:10:00.000Z',
    resultingRowVersion: 4,
    requestId: 'req-0008',
    operationId: '00000000-0000-0000-0000-000000000908',
    toStatus: 'Draft',
  },
  {
    eventId: '00000000-0000-0000-0000-000000000405',
    fromStatus: 'Draft',
    action: 'Submitted',
    reason: null,
    actorUserId: KEEPER_2_ID,
    actorDisplayName: keeper2.displayName,
    occurredAtUtc: '2026-08-05T12:40:00.000Z',
    resultingRowVersion: 5,
    requestId: 'req-0009',
    operationId: '00000000-0000-0000-0000-000000000909',
    toStatus: 'Submitted',
  },
  {
    eventId: '00000000-0000-0000-0000-000000000406',
    fromStatus: 'Submitted',
    action: 'Posted',
    reason: null,
    actorUserId: MANAGER_ID,
    actorDisplayName: manager.displayName,
    occurredAtUtc: '2026-08-05T13:00:00.000Z',
    resultingRowVersion: 6,
    requestId: 'req-0010',
    operationId: '00000000-0000-0000-0000-000000000910',
    toStatus: 'Posted',
  },
]

function DocumentTimelineDemo() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>دورة حياة كاملة — مستند استلام معكوس</CardTitle>
          <CardDescription>
            إنشاء ← إرسال ← ترحيل ← عكس، مع سبب العكس كما سجّله الخادم.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentTimeline events={reversedReceivingEvents} status="Reversed" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>دورة حياة مع رفض ومراجعة — مستند صرف</CardTitle>
          <CardDescription>إنشاء ← إرسال ← رفض ← بدء مراجعة ← إرسال ← ترحيل نهائي.</CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentTimeline events={rejectedThenPostedIssueEvents} status="Posted" />
        </CardContent>
      </Card>
    </div>
  )
}

export const documentTimelineGallerySections: GallerySection[] = [
  {
    id: 'document-timeline',
    titleAr: 'الجدول الزمني للمستند (DocumentTimeline)',
    descriptionAr:
      'سجل دورة حياة المستند من أحداث الخادم الفعلية فقط — بدون استنتاج أو عناصر قيد الانتظار، مع تلوين حسب نوع الحدث وخط زمني متوافق مع RTL.',
    render: () => <DocumentTimelineDemo />,
  },
]
