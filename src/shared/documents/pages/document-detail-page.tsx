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
  toPreflightLineShapes,
  type CapabilityEvaluation,
  type DocumentPreflight,
} from '@/shared/documents/document-policy-gates'
import { DocumentTimelineSection } from '@/shared/documents/document-timeline-section'
import { LifecycleActionBar } from '@/shared/documents/lifecycle-action-bar'
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
import type {
  AttachmentType,
  DocumentActionType,
  DocumentAttachment,
  DocumentLine,
  DocumentPolicy,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'
import { cn } from '@/shared/utils/class-names'
import { formatDate, formatDateTime, formatNumber, toArabicDigits } from '@/shared/utils/format'

/**
 * Mutation props the attachment panel needs, surfaced as an OPTIONAL page
 * prop: t10/t11 wire the real upload/delete mutations here. Until then the
 * panel renders its read-only presentation (server attachments + policy gate).
 */
export type DocumentDetailAttachmentMutationProps = Pick<
  AttachmentPanelProps,
  'pendingUploads' | 'onUpload' | 'onRemove' | 'onCancelPending' | 'isUploading' | 'uploadError'
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
  documentType: Exclude<WarehouseDocument['documentType'], 'Adjustment'>
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
const NOOP_REMOVE: (attachment: DocumentAttachment) => void = () => undefined
const NOOP_CANCEL_PENDING: (file: File) => void = () => undefined

const BASE_LINES_TABLE_COLUMN_COUNT = 7

/**
 * Read-only documents never carry edit-form `materialDomainId` snapshots, so
 * the capability gate is not re-evaluated client-side (the server owns
 * capability revalidation at post); no capabilities request is fired.
 */
const EMPTY_CAPABILITY_EVALUATIONS: readonly CapabilityEvaluation[] = []

/**
 * Client-side preflight summary (e12-t12) rendered above the lifecycle action
 * bar. Blocked gates render as Arabic destructive alerts; unknown gates render
 * as muted notes. Server blockers already rendered by the bar are deduped by
 * message text, and SoftFreeze advisories stay exclusively with the bar
 * (warnings only — never rendered here).
 */
function PreflightSummary({ preflight }: { preflight: DocumentPreflight | null }) {
  if (preflight === null) {
    return null
  }
  const blockerMessages = new Set(preflight.blockers.map((blocker) => blocker.messageAr))
  const visibleGates = preflight.gates.filter(
    (gate) => gate.messageAr !== null && !blockerMessages.has(gate.messageAr),
  )
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
  documentType: WarehouseDocument['documentType']
  lines: readonly DocumentLine[]
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
            <th scope="col" className="px-3 py-2 text-start font-medium">
              الرصيد المتاح
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
              key={line.lineId}
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
  line: DocumentLine
  showOpeningType: boolean
}) {
  const assetInputs = line.assetInputs ?? []
  return (
    <>
      <tr data-slot="document-line-row" className="border-b border-border last:border-b-0">
        <td className="px-3 py-2 font-medium text-foreground">
          {line.material.nameAr}
          <span className="ms-2 text-xs text-muted-foreground" dir="ltr">
            {line.material.code}
          </span>
        </td>
        <td className="px-3 py-2 text-foreground">{formatNumber(line.quantity)}</td>
        <td className="px-3 py-2 text-foreground">{line.unit?.displayName ?? '—'}</td>
        <td className="px-3 py-2 text-foreground">
          {line.unitPrice === null || line.unitPrice === undefined
            ? '—'
            : formatNumber(line.unitPrice)}
        </td>
        <td className="px-3 py-2 text-foreground">{line.batchNumber ?? '—'}</td>
        <td className="px-3 py-2 text-foreground">
          {line.expiryDate === null || line.expiryDate === undefined
            ? '—'
            : formatDate(line.expiryDate)}
        </td>
        <td className="px-3 py-2 text-foreground">
          {line.availableBalance === null || line.availableBalance === undefined
            ? '—'
            : formatNumber(line.availableBalance)}
        </td>
        {showOpeningType ? (
          <td className="px-3 py-2 text-foreground">
            {line.openingType === undefined ? '—' : OPENING_TYPE_LABELS[line.openingType]}
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
              الأصول المرتبطة — العدد: {toArabicDigits(assetInputs.length)}
            </p>
            {assetInputs.length === 0 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                لم تُسجل أرقام أصول على بنود هذا السند.
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-0.5">
                {assetInputs.map((asset, index) => (
                  <li key={index} className="text-xs text-muted-foreground">
                    <span dir="ltr" className="text-start">
                      رقم الأصل: {asset.assetNumber ?? '—'}
                      {asset.serialNumber !== null && asset.serialNumber !== undefined
                        ? ` | الرقم التسلسلي: ${asset.serialNumber}`
                        : ''}
                    </span>
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
  document: WarehouseDocument
  isActionPermitted?: ((action: DocumentActionType) => boolean) | undefined
  linesSlot?: ReactNode
  listRouteKey: RouteKey
  onExecuteAction?:
    ((action: DocumentActionType, reason?: string) => void | Promise<void>) | undefined
  petalSlot?: ReactNode
  policy: DocumentPolicy | null
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
  timelineSlot,
}: DocumentDetailBodyProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null)

  // readOnly presentation still registers nothing, but the section reads the
  // form context; the page seeds the header values from the server document so
  // the captured paper number/year/warehouse render instead of '—'.
  const form = useForm<DocumentHeaderContainer>({
    defaultValues: {
      header: {
        warehouseId: document.warehouse.id,
        paperDocumentNumber: document.paperDocumentNumber,
        paperDocumentYear: document.paperDocumentYear,
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

  const attachmentPolicy = {
    signedOriginalSatisfied: document.policy.signedOriginalSatisfied,
    blockers: document.policy.blockers,
  }
  // The mutable window (D-ATT-01) is the Draft status only — including the
  // post-Revise Draft. Outside it the panel stays read-only even when real
  // mutation props are wired; the shared helper is the single source of truth.
  const attachmentsReadOnly =
    attachmentMutationProps === undefined || !isDocumentMutable(document.documentStatus)

  // Surfaced read-only state (D-ATT-01): a muted note under the action bar
  // explains why the document cannot be edited once it leaves Draft. `null`
  // for a mutable Draft — the note only renders for read-only statuses.
  const readOnlyReasonAr = documentReadOnlyReasonAr(document.documentStatus)

  // Defence-in-depth gate: the routed page wires the session predicate; the
  // body defaults to the bar's backwards-compatible "render every presented
  // action" contract when composed standalone (gallery/tests).
  const permitAllActions = useCallback(() => true, [])

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
          <DetailField label="أنشأها">{document.createdBy.displayName}</DetailField>
          <DetailField label="تاريخ الإنشاء">{formatDateTime(document.createdAt)}</DetailField>
          {document.postedBy !== undefined ? (
            <DetailField label="رصدها">{document.postedBy.displayName}</DetailField>
          ) : null}
          {document.postedAt !== null && document.postedAt !== undefined ? (
            <DetailField label="تاريخ الرصد">{formatDateTime(document.postedAt)}</DetailField>
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
              createdByDisplayName: document.createdBy.displayName,
              rowVersion: document.rowVersion,
              warehouseDisplayName: document.warehouse.displayName,
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
        {policy === null ? (
          <p className="text-sm text-muted-foreground">بانتظار تقييم سياسة المستند من الخادم...</p>
        ) : (
          <LifecycleActionBar
            policy={policy}
            busyAction={busyAction}
            onExecute={handleExecute}
            isActionPermitted={isActionPermitted ?? permitAllActions}
          />
        )}
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
        attachmentMutationProps={{
          pendingUploads: attachmentManager.pendingUploads,
          onUpload: attachmentManager.onUpload,
          onRemove: attachmentManager.onRemove,
          onCancelPending: attachmentManager.onCancelPending,
          isUploading: attachmentManager.isUploading,
          uploadError: attachmentManager.uploadError,
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
