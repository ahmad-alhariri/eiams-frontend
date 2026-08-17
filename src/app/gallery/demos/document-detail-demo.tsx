import type { GallerySection } from '@/app/gallery/gallery-sections'
import { DocumentDetailBody } from '@/shared/documents/pages/document-detail-page'
import {
  createDocumentAttachment,
  createDocumentPolicy,
  createPolicyBlocker,
  createWarehouseDocument,
  createWarehouseDocumentLine,
  fixtureUuid,
} from '@/test/msw/factories'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

const WH_DOC_ID = fixtureUuid(231)
const JANUARY_2026 = '2026-01-02T00:00:00.000Z'

function postedReceivingDocument() {
  const inkLine = createWarehouseDocumentLine({
    availableBalance: 40,
    lineId: fixtureUuid(232),
    material: {
      code: 'IT-CON-INK',
      nameAr: 'حبر طابعة ليزر',
    },
    quantity: 40,
    unit: { id: fixtureUuid(233), displayName: 'عبوة' },
    unitPrice: 95000,
  })
  const assetLine = createWarehouseDocumentLine({
    availableBalance: 2,
    lineId: fixtureUuid(234),
    lineType: 'Asset',
    material: {
      code: 'IT-HW-PC-018',
      nameAr: 'حاسوب مكتبي محمول',
    },
    quantity: 2,
    unitPrice: null,
    assetInputs: [
      { assetNumber: 'AST-2026-0112', serialNumber: 'SN-88421-001' },
      { assetNumber: 'AST-2026-0113', serialNumber: 'SN-88421-002' },
    ],
  })
  return createWarehouseDocument({
    attachments: [
      createDocumentAttachment({
        attachmentId: fixtureUuid(235),
        documentId: WH_DOC_ID,
        originalFilename: 'signed-receiving-2026-0300.pdf',
        uploadedAt: JANUARY_2026,
      }),
    ],
    createdAt: JANUARY_2026,
    createdBy: { id: fixtureUuid(236), displayName: 'مريم حمادة' },
    documentId: WH_DOC_ID,
    documentStatus: 'Posted',
    documentType: 'Receiving',
    lines: [inkLine, assetLine],
    paperDocumentNumber: '2026/0300',
    paperDocumentYear: 2026,
    policy: { signedOriginalSatisfied: true },
    postedAt: JANUARY_2026,
    postedBy: { id: fixtureUuid(237), displayName: 'مدير المستودع' },
    rowVersion: 2,
    systemReferenceNumber: 'EIAMS-DOC-2026-0300',
    warehouse: { id: fixtureUuid(238), displayName: 'المستودع المركزي — دمشق' },
  })
}

function submittedIssueDocument() {
  return createWarehouseDocument({
    documentId: fixtureUuid(240),
    documentStatus: 'Submitted',
    documentType: 'Issue',
    lines: [
      createWarehouseDocumentLine({
        availableBalance: 12,
        lineId: fixtureUuid(241),
        material: { code: 'OFF-SUP-A4', nameAr: 'ورق تصوير A4' },
        quantity: 6,
        unit: { id: fixtureUuid(242), displayName: 'رزمة' },
      }),
    ],
    paperDocumentNumber: '2026/0451',
    paperDocumentYear: 2026,
    rowVersion: 1,
    systemReferenceNumber: 'EIAMS-DOC-2026-0451',
    warehouse: { id: fixtureUuid(243), displayName: 'مستودع الفرع — حلب' },
  })
}

function PostedReceivingDemo() {
  const document = postedReceivingDocument()
  return (
    <DocumentDetailBody
      detailRouteKey="documentReceivingDetail"
      document={document}
      listRouteKey="documentReceiving"
      policy={document.policy}
      petalSlot={
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2 rounded border border-border bg-muted/30 px-2 py-1.5">
            <dt className="text-muted-foreground">المورد</dt>
            <dd className="font-medium text-foreground">الشركة العامة للتجهيز</dd>
          </div>
          <div
            dir="ltr"
            className="flex justify-between gap-2 rounded border border-border bg-muted/30 px-2 py-1.5"
          >
            <dt className="text-muted-foreground">الفاتورة المرتبطة</dt>
            <dd className="font-medium text-foreground">INV-2026/0841</dd>
          </div>
        </dl>
      }
    />
  )
}

function SubmittedIssueDemo() {
  const document = submittedIssueDocument()
  return (
    <DocumentDetailBody
      detailRouteKey="documentIssueDetail"
      document={document}
      listRouteKey="documentIssue"
      policy={createDocumentPolicy({
        ...document.policy,
        blockers: [createPolicyBlocker()],
        signedOriginalSatisfied: false,
      })}
    />
  )
}

function submittedIssueOverBalanceDocument() {
  return createWarehouseDocument({
    documentId: fixtureUuid(250),
    documentStatus: 'Submitted',
    documentType: 'Issue',
    lines: [
      createWarehouseDocumentLine({
        availableBalance: 12,
        lineId: fixtureUuid(251),
        material: { code: 'OFF-SUP-A4', nameAr: 'ورق تصوير A4' },
        quantity: 25,
        unit: { id: fixtureUuid(252), displayName: 'رزمة' },
      }),
    ],
    paperDocumentNumber: '2026/0462',
    paperDocumentYear: 2026,
    policy: { signedOriginalSatisfied: true },
    rowVersion: 1,
    systemReferenceNumber: 'EIAMS-DOC-2026-0462',
    warehouse: { id: fixtureUuid(253), displayName: 'مستودع الفرع — حلب' },
  })
}

function SubmittedIssueOverBalanceDemo() {
  const document = submittedIssueOverBalanceDocument()
  return (
    <DocumentDetailBody
      detailRouteKey="documentIssueDetail"
      document={document}
      listRouteKey="documentIssue"
      policy={createDocumentPolicy({
        ...document.policy,
        signedOriginalSatisfied: true,
      })}
    />
  )
}

export const documentDetailGallerySections: GallerySection[] = [
  {
    id: 'document-detail',
    titleAr: 'صفحة تفاصيل السند المشتركة (DocumentDetailBody)',
    descriptionAr:
      'الصدفة المشتركة الموصولة بخمس مسارات (استلام، صرف، تحويل، افتتاحي، إرجاع): عرض قراءة فقط لبيانات الخادم — الحالة، الرأس، البنود (بما فيها بنود الأصول)، المرفقات وسياسة دورة الحياة، مع فتحات للبتلة والخط الزمني.',
    render: () => (
      <div className="flex flex-col gap-10">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            سند استلام مرحّل — عرض معتمد بالكامل
          </h2>
          <PostedReceivingDemo />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            سند صرف بانتظار الترحيل — معرقل النسخة الموقعة ظاهر
          </h2>
          <SubmittedIssueDemo />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            سند صرف بانتظار الترحيل مع معرقل الرصيد
          </h2>
          <SubmittedIssueOverBalanceDemo />
        </div>
      </div>
    ),
  },
]
