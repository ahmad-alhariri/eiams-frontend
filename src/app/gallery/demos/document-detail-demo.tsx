import type { GallerySection } from '@/app/gallery/gallery-sections'
import {
  createDocumentAttachment,
  createDocumentPolicy,
  createMaterial,
  createPolicyBlocker,
  createWarehouseDocument,
  createWarehouseDocumentLine,
  fixtureUuid,
} from '@/app/gallery/demos/document-detail-demo-fixtures'
import { DocumentDetailBody } from '@/shared/documents/pages/document-detail-page'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

const WH_DOC_ID = fixtureUuid(231)
const JANUARY_2026 = '2026-01-02T00:00:00.000Z'

function postedReceivingDocument() {
  const inkLine = createWarehouseDocumentLine({
    quantity: 40,
    id: fixtureUuid(232),
    material: createMaterial({ code: 'IT-CON-INK', nameAr: 'حبر طابعة ليزر' }),
    unitId: fixtureUuid(233),
    unitPrice: 95000,
  })
  const assetLine = createWarehouseDocumentLine({
    id: fixtureUuid(234),
    lineType: 'Asset',
    material: createMaterial({
      code: 'IT-HW-PC-018',
      materialKind: 'Asset',
      nameAr: 'حاسوب مكتبي محمول',
      requiresAssetNumber: true,
      trackingType: 'Serial',
    }),
    quantity: 2,
    unitPrice: null,
    assets: [
      {
        id: fixtureUuid(239),
        warehouseId: fixtureUuid(238),
        assetNumber: 'AST-2026-0112',
        serialNumber: 'SN-88421-001',
        acquisitionDate: '2026-01-01',
        warrantyExpiry: null,
      },
      {
        id: fixtureUuid(240),
        warehouseId: fixtureUuid(238),
        assetNumber: 'AST-2026-0113',
        serialNumber: 'SN-88421-002',
        acquisitionDate: '2026-01-01',
        warrantyExpiry: null,
      },
    ],
  })
  return createWarehouseDocument({
    attachments: [
      createDocumentAttachment({
        id: fixtureUuid(235),
        originalFilename: 'signed-receiving-2026-0300.pdf',
        uploadedAtUtc: JANUARY_2026,
      }),
    ],
    id: WH_DOC_ID,
    documentStatus: 'Posted',
    documentType: 'Receiving',
    lines: [inkLine, assetLine],
    paperDocumentNumber: '2026/0300',
    paperDocumentYear: 2026,
    signedCopyAttachmentId: fixtureUuid(235),
    postedAtUtc: JANUARY_2026,
    postedBy: fixtureUuid(237),
    rowVersion: 2,
    systemReferenceNumber: 'EIAMS-DOC-2026-0300',
    warehouseId: fixtureUuid(238),
  })
}

function submittedIssueDocument() {
  return createWarehouseDocument({
    id: fixtureUuid(240),
    documentStatus: 'Submitted',
    documentType: 'Issue',
    issueTo: {
      recipientType: 'OrganizationalUnit',
      recipientId: fixtureUuid(244),
      issueReason: 'تأمين سددي',
      recipientDisplayName: 'وحدة المشتريات',
      recipientStatus: 'Active',
    },
    receivingInfo: null,
    lines: [
      createWarehouseDocumentLine({
        id: fixtureUuid(241),
        material: createMaterial({ code: 'OFF-SUP-A4', nameAr: 'ورق تصوير A4' }),
        quantity: 6,
        unitId: fixtureUuid(242),
      }),
    ],
    paperDocumentNumber: '2026/0451',
    paperDocumentYear: 2026,
    rowVersion: 1,
    systemReferenceNumber: 'EIAMS-DOC-2026-0451',
    warehouseId: fixtureUuid(243),
  })
}

function PostedReceivingDemo() {
  const document = postedReceivingDocument()
  return (
    <DocumentDetailBody
      detailRouteKey="documentReceivingDetail"
      document={document}
      listRouteKey="documentReceiving"
      policy={createDocumentPolicy({
        documentId: document.id,
        status: document.documentStatus,
        rowVersion: document.rowVersion,
        signedOriginalSatisfied: true,
      })}
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
        documentId: document.id,
        status: document.documentStatus,
        rowVersion: document.rowVersion,
        blockers: [createPolicyBlocker()],
        signedOriginalSatisfied: false,
      })}
    />
  )
}

function submittedIssueOverBalanceDocument() {
  return createWarehouseDocument({
    id: fixtureUuid(250),
    documentStatus: 'Submitted',
    documentType: 'Issue',
    issueTo: {
      recipientType: 'OrganizationalUnit',
      recipientId: fixtureUuid(244),
      issueReason: 'تأمين سددي',
      recipientDisplayName: 'وحدة المشتريات',
      recipientStatus: 'Active',
    },
    receivingInfo: null,
    lines: [
      createWarehouseDocumentLine({
        id: fixtureUuid(251),
        material: createMaterial({ code: 'OFF-SUP-A4', nameAr: 'ورق تصوير A4' }),
        quantity: 25,
        unitId: fixtureUuid(252),
      }),
    ],
    paperDocumentNumber: '2026/0462',
    paperDocumentYear: 2026,
    rowVersion: 1,
    systemReferenceNumber: 'EIAMS-DOC-2026-0462',
    warehouseId: fixtureUuid(253),
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
        documentId: document.id,
        status: document.documentStatus,
        rowVersion: document.rowVersion,
        blockers: [
          createPolicyBlocker({
            code: 'InventoryBalances.InsufficientQuantity',
            message: 'Material exceeds the currently available quantity.',
          }),
        ],
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