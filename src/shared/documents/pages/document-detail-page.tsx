import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, matchPath, useLocation, useParams } from 'react-router'
import { FormProvider, useForm } from 'react-hook-form'

import { ROUTE_METADATA, ROUTE_PATHS, type RouteKey } from '@/config/routes'
import {
  DOCUMENT_TYPE_LABELS_AR,
  DocumentHeaderSection,
  type DocumentHeaderContainer,
} from '@/shared/documents/document-header-form'
import { AttachmentPanel, type AttachmentPanelProps } from '@/shared/documents/attachment-panel'
import { DocumentConflictDialog } from '@/shared/documents/document-conflict-dialog'
import { documentReadOnlyReasonAr, isDocumentMutable } from '@/shared/documents/document-read-only'
import { OPENING_TYPE_LABELS } from '@/shared/documents/schemas/document-lines.schemas'
import {
  evaluateDocumentPreflight,
  policyBlockerMessageAr,
  toPreflightLineShapes,
  type CapabilityEvaluation,
  type DocumentPreflight,
} from '@/shared/documents/document-policy-gates'
import { DocumentTimelineSection } from '@/shared/documents/document-timeline-section'
import { LifecycleActionBar } from '@/shared/documents/lifecycle-action-bar'
import { DocumentScopeReadOnlyBanner } from '@/shared/documents/components/document-scope-read-only-banner'
import { useDocumentConflictRecovery } from '@/shared/documents/use-document-conflict-recovery'
import { useDocumentAttachmentManager } from '@/shared/documents/use-document-attachments'
import {
  useCancelDocumentMutation,
  usePostDocumentMutation,
  useRejectDocumentMutation,
  useReverseDocumentMutation,
  useReviseDocumentMutation,
  useSubmitDocumentMutation,
  type LifecycleActionMutationApi,
} from '@/shared/documents/use-document-lifecycle-actions'
import {
  useDocumentDetailQuery,
  useDocumentPolicyQuery,
} from '@/shared/documents/use-document-queries'
import { useDocumentPolicyGate } from '@/shared/documents/use-document-policy-gate'
import { createIdempotencyKey, isConflictError } from '@/shared/services/mutation-safety'
import { EmptyState } from '@/shared/feedback/empty-state'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import type { AttachmentType } from '@/shared/documents/document-attachment-service'
import type { DocumentActionType } from '@/shared/documents/types/document-action.types'
import type { DocumentAttachmentResponse } from '@/shared/documents/types/document-wire.types'
import type {
  DocumentLineResponse,
  DocumentPolicy,
  DocumentType,
  OpeningType,
  WarehouseDocumentDetails,
} from '@/shared/documents/types/document-wire.types'
import { cn } from '@/shared/utils/class-names'
import { formatDate, formatDateTime, formatNumber, toArabicDigits } from '@/shared/utils/format'

/**
 * Mutation props the attachment panel needs, surfaced as an OPTIONAL page
 * prop: the routed page wires the real upload/delete manager (t06). Until then
 * the panel renders its read-only presentation (server attachments + policy
 * gate).
 *
 * `deleteError` is part of this `Pick` (e24-t10 / B1): the manager already
 * produced it, but the page's `Pick` — the narrower of the two prop types — was
 * dropping it on the floor, so a failed delete produced no user-visible
 * feedback whatsoever.
 */
export type DocumentDetailAttachmentMutationProps = Pick<
  AttachmentPanelProps,
  | 'pendingUploads'
  | 'onUpload'
  | 'onRemove'
  | 'onCancelPending'
  | 'isUploading'
  | 'uploadError'
  | 'deleteError'
>

export interface DocumentDetailPageProps {
  /**
   * Optional attachment mutation wiring (e12-t10/t11). When omitted the
   * AttachmentPanel renders read-only; when provided its props are passed
   * through untouched.
   */
  attachmentMutationProps?: DocumentDetailAttachmentMutationProps | undefined
  className?: string | undefined
  /**
   * Optional override of the read-only lines card content. Domain tasks use
   * it to swap the plain table for a petal-aware line editor without touching
   * the shared page.
   */
  linesSlot?: ReactNode
  /**
   * Lifecycle action execution (mutations land in t10/t11). Default handler
   * records the action into the busy state only — no network call.
   */
  onExecuteAction?:
    ((action: DocumentActionType, reason?: string) => void | Promise<void>) | undefined
  /** Type-specific petal editor (ReceivingInfo / IssueTo / TransferInfo / ReturnInfo). */
  petalSlot?: ReactNode
  /**
   * Lifecycle timeline slot. When omitted the routed page defaults it to the
   * real {@link DocumentTimelineSection} wired to the route's `:documentId`;
   * pass a custom node (fixture events in demos/tests) to replace it.
   */
  timelineSlot?: ReactNode
}

type DocumentDetailRouteKey =
  | 'documentReceivingDetail'
  | 'documentIssueDetail'
  | 'documentTransferDetail'
  | 'documentOpeningDetail'
  | 'documentReturnDetail'

type DocumentDetailRouteEntry = {
  detailRouteKey: DocumentDetailRouteKey
  documentType: Exclude<DocumentType, 'Adjustment'>
  listRouteKey: RouteKey
}

/**
 * One file, five routes: route path candidates mirroring the list page's
 * one-file-many-routes registry. ADJUSTMENT is excluded — it is a
 * shared-engine exception (docs/adjustment-workflow-decision.md) owned by the
 * adjustments module.
 */
const DOCUMENT_DETAIL_ROUTE_ENTRIES: Readonly<Record<string, DocumentDetailRouteEntry>> = {
  [ROUTE_PATHS.documentReceivingDetail]: {
    detailRouteKey: 'documentReceivingDetail',
    listRouteKey: 'documentReceiving',
    documentType: 'Receiving',
  },
  [ROUTE_PATHS.documentIssueDetail]: {
    detailRouteKey: 'documentIssueDetail',
    listRouteKey: 'documentIssue',
    documentType: 'Issue',
  },
  [ROUTE_PATHS.documentTransferDetail]: {
    detailRouteKey: 'documentTransferDetail',
    listRouteKey: 'documentTransfer',
    documentType: 'Transfer',
  },
  [ROUTE_PATHS.documentOpeningDetail]: {
    detailRouteKey: 'documentOpeningDetail',
    listRouteKey: 'documentOpening',
    documentType: 'Opening',
  },
  [ROUTE_PATHS.documentReturnDetail]: {
    detailRouteKey: 'documentReturnDetail',
    listRouteKey: 'documentReturn',
    documentType: 'Return',
  },
}

function findDocumentDetailRoute(pathname: string): DocumentDetailRouteEntry | undefined {
  for (const [pattern, entry] of Object.entries(DOCUMENT_DETAIL_ROUTE_ENTRIES)) {
    if (matchPath(pattern, pathname) !== null) {
      return entry
    }
  }
  return undefined
}

const NOOP_UPLOAD: (files: File[], attachmentType: AttachmentType) => void = () => undefined
const NOOP_REMOVE: (attachment: DocumentAttachmentResponse) => void = () => undefined
const NOOP_CANCEL_PENDING: (file: File) => void = () => undefined

const BASE_LINES_TABLE_COLUMN_COUNT = 6

/**
 * Read-only documents never carry edit-form `materialDomainId` snapshots, so
 * the capability gate is not re-evaluated client-side (the server owns
 * capability revalidation at post); no capabilities request is fired.
 */
const EMPTY_CAPABILITY_EVALUATIONS: readonly CapabilityEvaluation[] = []

/**
 * Client-side preflight summary (e12-t12) rendered above the lifecycle action
 * bar. Blocked gates render as Arabic destructive alerts; unknown gates render
 * as muted notes. SoftFreeze advisories stay exclusively with the bar (warnings
 * only — never rendered here).
 *
 * e24-t07: a gate that restates a blocker the server already renders is
 * suppressed **by blocker code** whenever the gate resolved one, so reworded
 * server copy can no longer make a single failure appear twice. Gates with no
 * server code of their own (balance, capability) fall back to matching the
 * Arabic message, which remains the only signal they carry.
 */
function PreflightSummary({ preflight }: { preflight: DocumentPreflight | null }) {
  if (preflight === null) {
    return null
  }
  const blockerCodes = new Set(preflight.blockers.map((blocker) => blocker.code))
  const blockerMessages = new Set(
    preflight.blockers
      .map((blocker) => policyBlockerMessageAr(blocker))
      .filter((message): message is string => message !== null),
  )
  const visibleGates = preflight.gates.filter((gate) => {
    if (gate.messageAr === null) {
      return false
    }
    if (gate.blockerCode !== null) {
      return !blockerCodes.has(gate.blockerCode)
    }
    return !blockerMessages.has(gate.messageAr)
  })
  if (visibleGates.length === 0) {
    return null
  }
  const blockedGates = visibleGates.filter((gate) => gate.status === 'blocked')
  const noteGates = visibleGates.filter((gate) => gate.status === 'unknown')
  return (
    <div className="flex flex-col gap-2">
      {blockedGates.length > 0 ? (
        <div role="alert" className="flex flex-col gap-1.5 rounded-md bg-destructive/5 px-3 py-2">
          {blockedGates.map((gate) => (
            <p
              key={gate.gate}
              className="flex items-start gap-2 text-sm font-medium text-destructive"
            >
              <IconAlertCircle
                data-slot="preflight-blocker-icon"
                className="mt-0.5 shrink-0"
                aria-hidden
              />
              <span>{gate.messageAr}</span>
            </p>
          ))}
        </div>
      ) : null}
      {noteGates.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 px-3 py-2">
          {noteGates.map((gate) => (
            <p key={gate.gate} className="flex items-start gap-2 text-sm text-muted-foreground">
              <IconInfoCircle
                data-slot="preflight-note-icon"
                className="mt-0.5 shrink-0"
                aria-hidden
              />
              <span>{gate.messageAr}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Read-only rendering of the server-owned `document.lines` collection. */
function DocumentLinesTable({
  documentType,
  lines,
}: {
  documentType: DocumentType
  lines: readonly DocumentLineResponse[]
}) {
  if (lines.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        لم تُسجل بنود على هذا السند.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table data-slot="document-lines-table" className="w-full min-w-130 text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-start text-muted-foreground">
            <th scope="col" className="px-3 py-2 text-start font-medium">
              المادة
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              الكمية
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              الوحدة
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              سعر الوحدة
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              رقم الدفعة
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              تاريخ الانتهاء
            </th>
            {documentType === 'Opening' ? (
              <th scope="col" className="px-3 py-2 text-start font-medium">
                نوع الافتتاحية
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <DocumentLineRow
              key={line.id}
              line={line}
              showOpeningType={documentType === 'Opening'}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DocumentLineRow({
  line,
  showOpeningType,
}: {
  line: DocumentLineResponse
  showOpeningType: boolean
}) {
  const linkedAssetCount = line.assets.length + line.selectedAssets.length
  return (
    <>
      <tr data-slot="document-line-row" className="border-b border-border last:border-b-0">
        <td className="px-3 py-2 font-medium text-foreground">
          {line.materialNameAr}
          <span dir="ltr" className="ms-2 text-xs text-muted-foreground">
            {line.materialCode}
          </span>
        </td>
        <td className="px-3 py-2 text-foreground">{formatNumber(line.quantity)}</td>
        <td className="px-3 py-2 text-foreground">
          {line.unitSymbol === null ? '—' : line.unitSymbol}
        </td>
        <td className="px-3 py-2 text-foreground">
          {line.unitPrice === null ? '—' : formatNumber(line.unitPrice)}
        </td>
        <td className="px-3 py-2 text-foreground">{line.batchNumber ?? '—'}</td>
        <td className="px-3 py-2 text-foreground">
          {line.expiryDate === null ? '—' : formatDate(line.expiryDate)}
        </td>
        {showOpeningType ? (
          <td className="px-3 py-2 text-foreground">
            {line.openingType === null || !(line.openingType in OPENING_TYPE_LABELS)
              ? '—'
              : OPENING_TYPE_LABELS[line.openingType as OpeningType]}
          </td>
        ) : null}
      </tr>
      {line.lineType === 'Asset' ? (
        <tr data-slot="asset-line-entries" className="border-b border-border last:border-b-0">
          <td
            colSpan={BASE_LINES_TABLE_COLUMN_COUNT + (showOpeningType ? 1 : 0)}
            className="bg-muted/30 px-4 py-2"
          >
            <p className="text-xs font-semibold text-foreground">
              الأصول المرتبطة — العدد: {toArabicDigits(linkedAssetCount)}
            </p>
            {linkedAssetCount === 0 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                لم تُسجل أرقام أصول على بنود هذا السند.
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-0.5">
                {line.assets.map((asset) => (
                  <li key={asset.id} className="text-xs text-muted-foreground">
                    <span dir="ltr" className="text-start">
                      رقم الأصل: {asset.assetNumber}
                      {asset.serialNumber === null
                        ? ''
                        : ` | الرقم التسلسلي: ${asset.serialNumber}`}
                    </span>
                  </li>
                ))}
                {line.selectedAssets.map((selected) => (
                  <li key={selected.selectionId} className="text-xs text-muted-foreground">
                    <span dir="ltr" className="text-start">
                      رقم الأصل: {selected.assetNumber}
                      {selected.serialNumber === null
                        ? ''
                        : ` | الرقم التسلسلي: ${selected.serialNumber}`}
                    </span>
                    <Link
                      className="break-all font-mono text-foreground underline-offset-4 hover:underline"
                      to={ROUTE_PATHS.assetDetail.replace(':assetId', selected.assetId)}
                    >
                      <span>{toArabicDigits(selected.assetId)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      ) : null}
    </>
  )
}

export interface DocumentDetailBodyProps extends DocumentDetailPageProps {
  attachmentMutationProps?: DocumentDetailAttachmentMutationProps | undefined
  className?: string | undefined
  detailRouteKey: DocumentDetailRouteKey
  document: WarehouseDocumentDetails
  isActionPermitted?: ((action: DocumentActionType) => boolean) | undefined
  linesSlot?: ReactNode
  listRouteKey: RouteKey
  onExecuteAction?:
    ((action: DocumentActionType, reason?: string) => void | Promise<void>) | undefined
  petalSlot?: ReactNode
  policy: DocumentPolicy | null
  /**
   * Present only when the policy read itself FAILED and no policy is available
   * (e24-t09 / SAD.md §"Resilience", D-AUD-02 rule 6). `policy: null` alone
   * cannot distinguish "still loading" from "the read failed", so the routed
   * page reports the failure here and this body replaces the action surface
   * with a retryable Arabic error instead of an unexplained pending note.
   * Absent for standalone compositions (gallery/tests) that pass no policy at
   * all — those keep the original pending presentation.
   */
  policyFailure?: { onRetry: () => void } | undefined
  timelineSlot?: ReactNode
}

/**
 * Pure-presentation body of the detail layout: renders the loaded document
 * authoritatively from server data — nothing is derived locally. The routed
 * page owns fetching and routing; this body stays composable so the gallery
 * and later tasks (lifecycle mutations t10/t11, timeline t08) drive the same
 * surface with real or fixture data.
 */
export function DocumentDetailBody({
  attachmentMutationProps,
  className,
  detailRouteKey,
  document,
  isActionPermitted,
  linesSlot,
  listRouteKey,
  onExecuteAction,
  petalSlot,
  policy,
  policyFailure,
  timelineSlot,
}: DocumentDetailBodyProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null)

  // readOnly presentation still registers nothing, but the section reads the
  // form context; the page seeds the header values from the server document so
  // the captured paper number/year/warehouse render instead of '—'.
  const form = useForm<DocumentHeaderContainer>({
    defaultValues: {
      header: {
        warehouseId: document.warehouseId,
        paperDocumentNumber: document.paperDocumentNumber ?? '',
        // A Draft may legitimately carry no paper reference yet; the read-only
        // header row renders '—' for an absent year, and an `undefined` key is
        // what `exactOptionalPropertyTypes` requires rather than an explicit null.
        ...(document.paperDocumentYear === null
          ? {}
          : { paperDocumentYear: document.paperDocumentYear }),
      },
    },
  })

  const fallbackExecute = useCallback((action: DocumentActionType) => {
    // Standalone compositions (gallery/tests) without a wired handler record
    // the action into the busy state only — no network call.
    setBusyAction(action)
    queueMicrotask(() => setBusyAction(null))
  }, [])

  // Read-only preflight derived purely from the server props this body
  // receives: balance (outbound types only) + signed-original gate (D-ATT-01,
  // server-authoritative). Capability is never re-evaluated client-side for
  // server-loaded lines (the server owns it at post), so it contributes no
  // visible note here. `null` while the policy is still loading.
  const preflight = useMemo<DocumentPreflight | null>(
    () =>
      policy === null
        ? null
        : evaluateDocumentPreflight({
            lines: toPreflightLineShapes(document.lines),
            documentType: document.documentType,
            policy,
            capability: EMPTY_CAPABILITY_EVALUATIONS,
            documentStatus: document.documentStatus,
          }),
    [document, policy],
  )

  const handleExecute = useCallback(
    async (action: DocumentActionType, reason?: string): Promise<void> => {
      if (onExecuteAction !== undefined) {
        setBusyAction(action)
        try {
          await onExecuteAction(action, reason)
        } finally {
          setBusyAction(null)
        }
        return
      }
      return fallbackExecute(action)
    },
    [fallbackExecute, onExecuteAction],
  )

  // The signed-original gate is server-authoritative and lives on the POLICY
  // projection — `WarehouseDocumentDetails` carries no embedded policy member, so
  // it is read from the `policy` prop this page already fetched. `null` while the
  // policy read is pending, which the panel renders as its own pending badge.
  const attachmentPolicy =
    policy === null
      ? null
      : {
          signedOriginalSatisfied: policy.signedOriginalSatisfied,
          blockers: policy.blockers,
        }
  // Defence-in-depth gate: the routed page wires the session predicate; the
  // body defaults to the bar's backwards-compatible "render every presented
  // action" contract when composed standalone (gallery/tests).
  const permitAllActions = useCallback(() => true, [])
  const permitAction = isActionPermitted ?? permitAllActions

  // The mutable window (D-ATT-01) is the Draft status only — including the
  // post-Revise Draft. Outside it the panel stays read-only even when real
  // mutation props are wired; the shared helper is the single source of truth.
  //
  // A Draft is necessary but not sufficient: uploading or removing a draft
  // attachment is `document.update` (D-ATT-01 §"Upload/delete controls are
  // rendered only inside the mutable window AND only for users with
  // document.update"). `UploadAttachment` already maps to that code in
  // use-document-permissions, so reusing the same predicate keeps one gate for
  // both surfaces. `AttachmentPanel` treats read-only as *hidden* controls,
  // which is the presentation D-LIFE-01 requires for a permission denial
  // (a state/policy block is what disables, and the panel has no such state).
  const attachmentsReadOnly =
    attachmentMutationProps === undefined ||
    !isDocumentMutable(document.documentStatus) ||
    !permitAction('UploadAttachment')

  // Surfaced read-only state (D-ATT-01): a muted note under the action bar
  // explains why the document cannot be edited once it leaves Draft. `null`
  // for a mutable Draft — the note only renders for read-only statuses.
  const readOnlyReasonAr = documentReadOnlyReasonAr(document.documentStatus)

  const backLabel = `العودة إلى ${ROUTE_METADATA[listRouteKey].labelAr}`

  return (
    <div dir="rtl" data-slot="document-detail-page" className={cn('min-w-0', className)}>
      <PageHeader
        title={
          <>
            {ROUTE_METADATA[detailRouteKey].labelAr}
            <span dir="ltr" className="font-english text-muted-foreground">
              {' '}
              — {document.systemReferenceNumber}
            </span>
          </>
        }
        subtitle={`سرد تفاصيل السند كما يعتمدها الخادم ضمن نطاق العمل الحالي — عرض للقراءة فقط، والمصدر الوحيد هو بيانات الخادم.`}
        toolbar={
          <Button
            type="button"
            nativeButton={false}
            variant="outline"
            render={<Link to={ROUTE_PATHS[listRouteKey]} />}
          >
            {backLabel}
          </Button>
        }
      />

      <ContentCard
        title="تفاصيل السند"
        description="الحالة المعتمدة للمستند ومعلومات جلده الأساسية كما سُجلت على الخادم."
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge entity="document" status={document.documentStatus} />
          <Badge variant="outline" data-slot="document-meta-row-version">
            الإصدار: {document.rowVersion}
          </Badge>
        </div>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <DetailField label="نوع المستند">
            {DOCUMENT_TYPE_LABELS_AR[document.documentType]}
          </DetailField>
          {document.postedBy !== null ? (
            // The detail read carries the poster as a user id, not a display
            // reference; the id is shown rather than a name the server never sent.
            <DetailField label="رصدها">
              <span dir="ltr" className="break-all font-mono text-xs">
                {document.postedBy}
              </span>
            </DetailField>
          ) : null}
          {document.postedAtUtc !== null ? (
            <DetailField label="تاريخ الرصد">{formatDateTime(document.postedAtUtc)}</DetailField>
          ) : null}
        </dl>
      </ContentCard>

      <ContentCard
        title="بيانات المستند"
        description="رأس السند المشترك (المستودع، رقم السند الورقي وسنته) في وضع القراءة فقط."
      >
        <FormProvider {...form}>
          <DocumentHeaderSection
            documentType={document.documentType}
            readOnly
            initialValues={{
              rowVersion: document.rowVersion,
              // The detail read names its warehouse inline, so the label the
              // server sent is shown rather than the id it also carries.
              warehouseDisplayName: document.warehouseName,
            }}
            petalSlot={petalSlot}
          />
        </FormProvider>
      </ContentCard>

      <ContentCard
        title="بنود السند"
        description="بنود المستند كما سُجلت عند إنشائه — قراءة فقط من بيانات الخادم."
      >
        {linesSlot ?? (
          <DocumentLinesTable documentType={document.documentType} lines={document.lines} />
        )}
      </ContentCard>

      <ContentCard
        title="المرفقات"
        description="نسخة المستند الموقعة والملفات الداعمة وفق سياسة الخادم (D-ATT-01)."
      >
        <AttachmentPanel
          attachments={document.attachments}
          pendingUploads={attachmentMutationProps?.pendingUploads ?? []}
          onUpload={attachmentMutationProps?.onUpload ?? NOOP_UPLOAD}
          onRemove={attachmentMutationProps?.onRemove ?? NOOP_REMOVE}
          onCancelPending={attachmentMutationProps?.onCancelPending ?? NOOP_CANCEL_PENDING}
          isUploading={attachmentMutationProps?.isUploading ?? false}
          uploadError={attachmentMutationProps?.uploadError ?? null}
          deleteError={attachmentMutationProps?.deleteError ?? null}
          policy={attachmentPolicy}
          documentStatus={document.documentStatus}
          readOnly={attachmentsReadOnly}
        />
      </ContentCard>

      <ContentCard
        title="دورة حياة السند"
        description="إجراءات الدورة المتاحة وفق تقييم السياسة الصادر من الخادم، مع المعرقلات والتنبيهات."
      >
        <PreflightSummary preflight={preflight} />
        {policyFailure !== undefined ? (
          // Partial failure modeled independently (SAD.md:230, D-AUD-02 rule 6):
          // the document above rendered fine, so only this policy-dependent
          // surface degrades — and it degrades loudly, with a retry, instead of
          // leaving the user on a permanently "awaiting policy" note.
          <ErrorState
            className="min-h-40"
            title="تعذّر تحميل سياسة السند"
            description="تعذّر جلب تقييم إجراءات دورة حياة السند من الخادم، لذلك لا تُعرض الإجراءات الآن. بيانات السند أعلاه صحيحة. تحقق من الاتصال ثم أعد المحاولة."
            action={
              <Button type="button" variant="outline" size="sm" onClick={policyFailure.onRetry}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : policy === null ? (
          <p className="text-sm text-muted-foreground">بانتظار تقييم سياسة المستند من الخادم...</p>
        ) : (
          <LifecycleActionBar
            policy={policy}
            busyAction={busyAction}
            onExecute={handleExecute}
            isActionPermitted={permitAction}
          />
        )}
        <DocumentScopeReadOnlyBanner />
        {readOnlyReasonAr !== null ? (
          <p
            data-slot="document-read-only-note"
            className="text-sm text-muted-foreground"
            dir="rtl"
          >
            عرض للقراءة فقط — {readOnlyReasonAr}
          </p>
        ) : null}
        {timelineSlot}
      </ContentCard>
    </div>
  )
}

/**
 * Shared document detail layout (e12-t07): one file, five routes (Receiving /
 * Issue / Transfer / Opening / Return). The page mirrors the list page's
 * route-derivation pattern — the path picks the document type and the title/
 * back-link come from route metadata; `:documentId` comes from React Router.
 * Data is server-authoritative (detail + policy queries); every section
 * renders from the loaded document, nothing is derived locally. Lifecycle
 * mutations (t10/t11) run through the mutation family with one retry-safe
 * idempotency key per user-approved action, and the attachment panel is wired
 * to the real upload/delete manager (t06).
 */
function DocumentDetailPage({
  className,
  linesSlot,
  petalSlot,
  timelineSlot,
}: DocumentDetailPageProps) {
  const location = useLocation()
  const { documentId } = useParams<{ documentId: string }>()
  const routeEntry = findDocumentDetailRoute(location.pathname)

  // Slot default: the real timeline section, wired to the route id. The
  // element stays inert until DocumentDetailBody mounts it, so no history
  // request fires during detail loading/error states. `documentId ?? null`
  // keeps standalone compositions (gallery) with a null id safe: no query.
  const effectiveTimelineSlot = timelineSlot ?? (
    <DocumentTimelineSection documentId={documentId ?? null} />
  )

  const detailQuery = useDocumentDetailQuery(documentId ?? null, {
    enabled: routeEntry !== undefined && documentId !== undefined,
  })
  const policyQuery = useDocumentPolicyQuery(documentId ?? null, {
    enabled: routeEntry !== undefined && documentId !== undefined,
  })
  // Shared coordinator (e12-t12): observes the same detail/policy cache keys
  // as the queries above (TanStack dedupes by key — one fetch, two observers)
  // and composes the server policy presentation with the session permission
  // gate into the per-action decision the lifecycle bar consumes.
  const policyGate = useDocumentPolicyGate(documentId ?? null, {
    enabled: routeEntry !== undefined && documentId !== undefined,
  })
  // Conflict-recovery coordinator (e12-t13): same keys + same enabled flag →
  // deduped with the queries above. Owns only the recovery UI state and the
  // composed refetch; mutation execution stays in this page.
  const conflictRecovery = useDocumentConflictRecovery(documentId ?? null, {
    enabled: routeEntry !== undefined && documentId !== undefined,
  })
  // `reportConflict` is a stable useCallback; the recovery state object above
  // is recreated every render, so only the function enters the action deps.
  const { reportConflict } = conflictRecovery
  const attachmentManager = useDocumentAttachmentManager(documentId ?? null)

  // F-1 (e24-t09, SAD.md:230 / D-AUD-02 rule 6): the detail and policy reads
  // are two independent queries, so they must degrade independently.
  // `policyQuery.data ?? null` collapses "still loading" and "the read failed"
  // into the same `null`, which made ONE failed policy read render a fully
  // loaded document whose entire lifecycle action surface silently vanished
  // behind a permanent "awaiting policy evaluation" note — no Arabic reason,
  // no error, no retry. It fails CLOSED (no action is ever wrongly enabled),
  // so this is a recovery/UX/a11y defect, not a privilege-escalation hole.
  // Only a FAILED read with no cached policy reports the failure; a failed
  // background refetch over already-cached policy data keeps rendering the
  // bar from the server's last authoritative evaluation. The retry closes over
  // the live query object rather than a memoized refetch, so it always
  // refetches the current key.
  const policyFailure =
    policyQuery.isError && policyQuery.data === undefined
      ? { onRetry: () => void policyQuery.refetch() }
      : undefined

  const submitMutation = useSubmitDocumentMutation(documentId ?? null)
  const postMutation = usePostDocumentMutation(documentId ?? null)
  const rejectMutation = useRejectDocumentMutation(documentId ?? null)
  const reviseMutation = useReviseDocumentMutation(documentId ?? null)
  const cancelMutation = useCancelDocumentMutation(documentId ?? null)
  const reverseMutation = useReverseDocumentMutation(documentId ?? null)

  // One retry-safe idempotency key per user-approved action execution: created
  // on first execution, kept on failure so a retry of the same action reuses
  // it, cleared on success (the server owns duplicate detection).
  const idempotencyKeysRef = useRef<Partial<Record<DocumentActionType, string>>>({})

  const handleExecuteAction = useCallback(
    (action: DocumentActionType, reason?: string): Promise<void> => {
      const document = detailQuery.data
      if (document === undefined) {
        return Promise.resolve()
      }
      const lifecycleMutations: Partial<Record<DocumentActionType, LifecycleActionMutationApi>> = {
        Submit: submitMutation,
        Post: postMutation,
        Reject: rejectMutation,
        Revise: reviseMutation,
        Cancel: cancelMutation,
        Reverse: reverseMutation,
      }
      const mutation = lifecycleMutations[action]
      if (mutation === undefined) {
        return Promise.resolve()
      }
      let idempotencyKey = idempotencyKeysRef.current[action]
      if (idempotencyKey === undefined) {
        idempotencyKey = createIdempotencyKey()
        idempotencyKeysRef.current[action] = idempotencyKey
      }
      // Retry contract after recovery (e12-t13): the rowVersion is read from
      // `detailQuery.data` AT CALL TIME, so after `recover()` refetches the
      // fresh document the retried action submits the new rowVersion; the
      // idempotency key is kept on failure, so the retry reuses the SAME key
      // the server already saw for this user-approved action.
      return mutation
        .mutateAsync({
          rowVersion: document.rowVersion,
          ...(reason === undefined ? {} : { reason }),
          idempotencyKey,
        })
        .then(
          () => {
            delete idempotencyKeysRef.current[action]
          },
          (error: unknown) => {
            // A 409 hands the stale-cache situation to the recovery flow
            // (the Arabic error toast already surfaced from the mutation).
            if (isConflictError(error)) {
              reportConflict()
            }
            return undefined
          },
        )
    },
    [
      cancelMutation,
      detailQuery.data,
      postMutation,
      rejectMutation,
      reportConflict,
      reverseMutation,
      reviseMutation,
      submitMutation,
    ],
  )

  if (routeEntry === undefined || documentId === undefined) {
    return null
  }

  if (detailQuery.isPending) {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title={ROUTE_METADATA[routeEntry.detailRouteKey].labelAr} />
        <ContentCard>
          <LoadingSpinner className="min-h-48" label="جارٍ تحميل تفاصيل السند..." />
        </ContentCard>
      </div>
    )
  }

  if (detailQuery.isError) {
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحميل تفاصيل السند"
          description="تعذّر جلب بيانات السند من الخادم. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => void detailQuery.refetch()}>
                إعادة المحاولة
              </Button>
              <Button
                type="button"
                nativeButton={false}
                variant="outline"
                render={<Link to={ROUTE_PATHS[routeEntry.listRouteKey]} />}
              >
                العودة إلى القائمة
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  if (detailQuery.data === undefined) {
    return (
      <div dir="rtl" className="min-w-0">
        <EmptyState
          title="لا تتوفر بيانات السند"
          description="لم تُرجع الخدمة بيانات قابلة للعرض لهذا السند. ارجع إلى القائمة واختر سنداً آخر."
          action={
            <Button
              type="button"
              nativeButton={false}
              variant="outline"
              render={<Link to={ROUTE_PATHS[routeEntry.listRouteKey]} />}
            >
              العودة إلى القائمة
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <>
      <DocumentDetailBody
        className={className}
        detailRouteKey={routeEntry.detailRouteKey}
        document={detailQuery.data}
        isActionPermitted={(action) => policyGate.decision(action).presentation !== 'Hidden'}
        listRouteKey={routeEntry.listRouteKey}
        policy={policyQuery.data ?? null}
        policyFailure={policyFailure}
        attachmentMutationProps={{
          pendingUploads: attachmentManager.pendingUploads,
          onUpload: attachmentManager.onUpload,
          onRemove: attachmentManager.onRemove,
          onCancelPending: attachmentManager.onCancelPending,
          isUploading: attachmentManager.isUploading,
          uploadError: attachmentManager.uploadError,
          deleteError: attachmentManager.deleteError,
        }}
        linesSlot={linesSlot}
        onExecuteAction={handleExecuteAction}
        petalSlot={petalSlot}
        timelineSlot={effectiveTimelineSlot}
      />
      {conflictRecovery.conflict.active ? (
        <DocumentConflictDialog
          isRefreshing={conflictRecovery.conflict.isRefreshing}
          onRecover={() => void conflictRecovery.recover()}
          onDismiss={conflictRecovery.dismiss}
        />
      ) : null}
    </>
  )
}

export { DocumentDetailPage }
export default DocumentDetailPage
