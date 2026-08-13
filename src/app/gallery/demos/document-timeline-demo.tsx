import type { GallerySection } from '@/app/gallery/gallery-sections'
import { DocumentTimeline } from '@/shared/documents/document-timeline'
import type { DocumentLifecycleEvent } from '@/shared/types/generated/eiams-v1'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

const RECEIVING_DOCUMENT_ID = '00000000-0000-0000-0000-000000000101'
const ISSUE_DOCUMENT_ID = '00000000-0000-0000-0000-000000000102'
const KEEPER_ID = '00000000-0000-0000-0000-000000000201'
const KEEPER_2_ID = '00000000-0000-0000-0000-000000000202'
const MANAGER_ID = '00000000-0000-0000-0000-000000000203'

const keeper = {
  displayName: 'أحمد علي',
  roleNameAr: 'أمين مستودع',
  userId: KEEPER_ID,
}
const keeper2 = {
  displayName: 'سارة الخطيب',
  roleNameAr: 'أمينة مستودع',
  userId: KEEPER_2_ID,
}
const manager = {
  displayName: 'ماجد الحلبي',
  roleNameAr: 'مدير مستودع',
  userId: MANAGER_ID,
}

const reversedReceivingEvents: DocumentLifecycleEvent[] = [
  {
    documentId: RECEIVING_DOCUMENT_ID,
    documentRowVersion: 1,
    eventId: '00000000-0000-0000-0000-000000000301',
    eventType: 'Created',
    occurredAt: '2026-08-09T08:00:00.000Z',
    occurredBy: keeper,
    toStatus: 'Draft',
  },
  {
    documentId: RECEIVING_DOCUMENT_ID,
    documentRowVersion: 2,
    eventId: '00000000-0000-0000-0000-000000000302',
    eventType: 'Submitted',
    fromStatus: 'Draft',
    occurredAt: '2026-08-09T09:15:00.000Z',
    occurredBy: keeper,
    toStatus: 'Submitted',
  },
  {
    documentId: RECEIVING_DOCUMENT_ID,
    documentRowVersion: 3,
    eventId: '00000000-0000-0000-0000-000000000303',
    eventType: 'Posted',
    fromStatus: 'Submitted',
    occurredAt: '2026-08-09T11:30:00.000Z',
    occurredBy: manager,
    toStatus: 'Posted',
  },
  {
    documentId: RECEIVING_DOCUMENT_ID,
    documentRowVersion: 4,
    eventId: '00000000-0000-0000-0000-000000000304',
    eventType: 'Reversed',
    fromStatus: 'Posted',
    occurredAt: '2026-08-10T09:45:00.000Z',
    occurredBy: manager,
    reason: 'خطأ حسابي في الكميات المسجلة؛ تم العكس عبر مستند صرف تعويضي.',
    relatedDocument: {
      documentId: '00000000-0000-0000-0000-000000000105',
      documentType: 'Issue',
      status: 'Posted',
      systemReferenceNumber: 'ISS-2026-000742',
    },
    toStatus: 'Reversed',
  },
]

const rejectedThenPostedIssueEvents: DocumentLifecycleEvent[] = [
  {
    documentId: ISSUE_DOCUMENT_ID,
    documentRowVersion: 1,
    eventId: '00000000-0000-0000-0000-000000000401',
    eventType: 'Created',
    occurredAt: '2026-08-05T07:15:00.000Z',
    occurredBy: keeper2,
    toStatus: 'Draft',
  },
  {
    documentId: ISSUE_DOCUMENT_ID,
    documentRowVersion: 2,
    eventId: '00000000-0000-0000-0000-000000000402',
    eventType: 'Submitted',
    fromStatus: 'Draft',
    occurredAt: '2026-08-05T08:05:00.000Z',
    occurredBy: keeper2,
    toStatus: 'Submitted',
  },
  {
    documentId: ISSUE_DOCUMENT_ID,
    documentRowVersion: 3,
    eventId: '00000000-0000-0000-0000-000000000403',
    eventType: 'Rejected',
    fromStatus: 'Submitted',
    occurredAt: '2026-08-05T09:20:00.000Z',
    occurredBy: manager,
    reason: 'صورة التوقيع المطلوبة غير مرفقة بالمستند الأصلي.',
    toStatus: 'Rejected',
  },
  {
    documentId: ISSUE_DOCUMENT_ID,
    documentRowVersion: 4,
    eventId: '00000000-0000-0000-0000-000000000404',
    eventType: 'RevisionStarted',
    fromStatus: 'Rejected',
    occurredAt: '2026-08-05T10:10:00.000Z',
    occurredBy: keeper2,
    toStatus: 'Draft',
  },
  {
    documentId: ISSUE_DOCUMENT_ID,
    documentRowVersion: 5,
    eventId: '00000000-0000-0000-0000-000000000405',
    eventType: 'Submitted',
    fromStatus: 'Draft',
    occurredAt: '2026-08-05T12:40:00.000Z',
    occurredBy: keeper2,
    toStatus: 'Submitted',
  },
  {
    documentId: ISSUE_DOCUMENT_ID,
    documentRowVersion: 6,
    eventId: '00000000-0000-0000-0000-000000000406',
    eventType: 'Posted',
    fromStatus: 'Submitted',
    occurredAt: '2026-08-05T13:00:00.000Z',
    occurredBy: manager,
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
            إنشاء ← إرسال ← ترحيل ← عكس، مع مستند تعويضي مرجعي في حدث العكس.
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
