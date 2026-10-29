import {
  IconAlertTriangle,
  IconBan,
  IconCheck,
  IconFileText,
  IconRotate,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { useId } from 'react'

import {
  attachmentSignedDescriptionAr,
  attachmentSupportingDescriptionAr,
  SIGNED_GATE_MOOT_STATUSES,
  signedOriginalBlockerReasonAr,
  type AttachmentLimits,
} from '@/shared/documents/document-policy-gates'
import { isSignedOriginalBlocker } from '@/shared/documents/policy-blocker-codes'
import type { AttachmentType } from '@/shared/documents/document-attachment-service'
import type {
  DocumentAttachmentResponse,
  DocumentStatus,
  SignedOriginalAttachmentMetadata,
} from '@/shared/documents/types/document-wire.types'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { DROPZONE_ACCEPT, FileDropzone } from '@/shared/feedback/file-dropzone'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/utils/class-names'
import { formatDate, formatDateTime, formatFileSize } from '@/shared/utils/format'

/**
 * Policy slice consumed by the panel; the server evaluation is authoritative
 * (D-ATT-01).
 *
 * `blockers` is typed by the fields the panel actually reads: the signed-original
 * row resolves the Arabic sentence from the blocker CODE (and the server's own
 * Arabic sentence when it carries one) through the shared policy-gate copy, so
 * the panel never invents a reason of its own.
 */
export type AttachmentPanelPolicy = {
  signedOriginalSatisfied: boolean
  /**
   * The server's policy blockers. The signed-original reason is stated by the
   * gate row (see {@link GateStatusRow}); the lifecycle/adjustment action bars
   * omit the same blocker as a duplicate.
   */
  blockers?: readonly { readonly code: string; readonly message?: string | null }[]
  /** Server's max upload size in bytes (F-14); absent on older cached policies. */
  maxSizeBytes?: number | null
  /** Server-allowed MIME types (F-14); absent on older cached policies. */
  allowedContentTypes?: readonly string[] | null
  /**
   * Metadata of the active SignedOriginal attachment that satisfies the gate
   * (identity + size + checksum, never the bytes). Rendered as a summary.
   */
  satisfyingSignedOriginal?: SignedOriginalAttachmentMetadata | null
}

/** A file chosen by the user whose upload mutation the parent still owns. */
export type PendingAttachmentUpload = {
  file: File
  attachmentType: AttachmentType
  /** Parent-driven marker: set when the parent's upload mutation failed for this file. */
  failed?: boolean
}

export type AttachmentPanelProps = {
  /** Server-bound attachments; the panel renders and removes, never mutates. */
  attachments: readonly DocumentAttachmentResponse[]
  /** Files chosen but not yet confirmed by the server; the parent owns the state. */
  pendingUploads: readonly PendingAttachmentUpload[]
  /** Parent-owned upload mutation; called when the user selects files. */
  onUpload: (files: File[], attachmentType: AttachmentType) => void
  /** Parent-owned delete mutation; called after the destructive confirm. */
  onRemove: (attachment: DocumentAttachmentResponse) => void
  /** Instant cancel of a pending (never uploaded) file; no confirm is shown. */
  onCancelPending: (file: File) => void
  /** True while any parent upload mutation is in flight; locks the pickers. */
  isUploading: boolean
  /** Arabic error text from the parent's failed upload mutation. */
  uploadError?: string | null
  /**
   * Arabic error text from the parent's failed delete mutation. A delete
   * targets an already-stored row, not a pending one, so it has no row to
   * render inside; the panel surfaces it as its own `role="alert"` region
   * (e24-t10 / B1). Without this prop a 403/409/network delete failure left the
   * screen unchanged and said nothing at all.
   */
  deleteError?: string | null
  /** DocumentPolicy slice for the signed-original gate row (display only). */
  policy?: AttachmentPanelPolicy | null
  /** Current document status; when posting is no longer possible the gate
   *  row reports the requirement as moot instead of pending (46f2 family). */
  documentStatus?: DocumentStatus
  /** Hides every mutation control (outside the Draft mutable window). */
  readOnly?: boolean
  /** Transient busy state: controls stay visible but disabled. */
  disabled?: boolean
  /** Max files selectable at once in the supporting section. */
  supportingMaxFiles?: number
  className?: string
}

const DEFAULT_UPLOAD_ERROR = 'تعذر رفع الملف — حاول مرة أخرى'

/**
 * What the uploader row says when the wire carries only the uploader's id.
 *
 * The attachment projection serves `UploadedBy` (a user id) and no display
 * name, so the panel cannot name the uploader — it can only say that a
 * registered user uploaded the file.
 */
const UPLOADER_LABEL_AR = 'مستخدم معروف'

function GateStatusRow({
  policy,
  hasSignedOriginal,
  documentStatus,
}: {
  policy: AttachmentPanelPolicy | null | undefined
  hasSignedOriginal: boolean
  documentStatus: DocumentStatus | undefined
}) {
  const satisfied = policy ? policy.signedOriginalSatisfied : hasSignedOriginal
  // The signed-original statement has ONE owner per screen, and this row is it:
  // it states the REQUIREMENT (the gate badge) AND the reason, because it sits
  // next to the badge and is where a user looks for the reason. The lifecycle
  // and adjustment action bars therefore omit the same blocker as a duplicate.
  //
  // The matcher is the canonical one (`policy-blocker-codes.ts`), so every
  // accepted spelling resolves — the bare code, the `document.`-prefixed
  // vocabulary the contract producers emit, and the backend's own dotted
  // signed-copy code. The reason itself comes from the shared policy-gate copy,
  // never from a sentence invented here.
  const signedBlocker = policy?.blockers?.find(isSignedOriginalBlocker)
  const signedBlockerReasonAr =
    signedBlocker === undefined ? null : signedOriginalBlockerReasonAr(signedBlocker)

  if (documentStatus !== undefined && SIGNED_GATE_MOOT_STATUSES.has(documentStatus)) {
    return (
      <Badge
        data-slot="attachment-gate-moot"
        data-testid="attachment-gate-moot"
        variant="outline"
        className="gap-1.5"
      >
        <IconBan aria-hidden />
        النسخة الموقعة غير مطلوبة بعد الآن
      </Badge>
    )
  }

  if (satisfied) {
    return (
      <Badge
        data-slot="attachment-gate-satisfied"
        data-testid="attachment-gate-satisfied"
        variant="success"
        className="gap-1.5"
      >
        <IconCheck aria-hidden />
        النسخة الأصلية الموقعة مرفوعة
      </Badge>
    )
  }

  return (
    <div
      data-slot="attachment-gate-missing"
      data-testid="attachment-gate-missing"
      role="status"
      className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2"
    >
      <IconAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">النسخة الأصلية الموقعة مطلوبة للترحيل</p>
        {signedBlockerReasonAr === null ? null : (
          <p data-slot="attachment-gate-reason" className="text-xs text-muted-foreground">
            {signedBlockerReasonAr}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The MIME→extension accept map for a server-supplied content-type list, or
 * `undefined` to keep `FileDropzone`'s own default. Unknown types keep an empty
 * extension list so the native picker still accepts them by MIME.
 */
function acceptForContentTypes(
  contentTypes: readonly string[] | null | undefined,
): Record<string, string[]> | undefined {
  if (contentTypes === null || contentTypes === undefined || contentTypes.length === 0) {
    return undefined
  }
  const accept: Record<string, string[]> = {}
  for (const type of contentTypes) {
    accept[type] = DROPZONE_ACCEPT[type] ?? []
  }
  return accept
}

/**
 * Server metadata for the active SignedOriginal attachment that satisfies the
 * posting gate (D-ATT-01). Renders identity, size and checksum only — never the
 * file bytes — so the panel can state WHAT the server accepted without
 * pretending to hold it.
 */
function SignedOriginalSatisfierSummary({
  metadata,
}: {
  metadata: SignedOriginalAttachmentMetadata
}) {
  const fields: ReadonlyArray<{
    label: string
    value: string
    ltr?: boolean
    /** Secondary detail the label does not state (the raw id behind it). */
    title?: string
  }> = [
    { label: 'معرّف المرفق', value: metadata.attachmentId, ltr: true },
    { label: 'اسم الملف', value: metadata.filename },
    { label: 'نوع الملف', value: metadata.mimeType, ltr: true },
    { label: 'الحجم', value: formatFileSize(metadata.size) },
    { label: 'تاريخ الرفع', value: formatDateTime(metadata.uploadedAtUtc) },
    // The wire carries the uploader's USER ID only — no display name, and the
    // frontend has no user directory to resolve one — so the row states an
    // honest Arabic label and keeps the id as the secondary text. A bare UUID
    // printed as a name would read as a person's name and identify nobody.
    { label: 'رفعه', value: UPLOADER_LABEL_AR, title: metadata.uploadedBy },
    { label: 'بصمة التحقق', value: metadata.checksum, ltr: true },
  ]
  return (
    <dl
      data-slot="signed-original-satisfier"
      data-testid="signed-original-satisfier"
      className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-ivory/50 p-3 sm:grid-cols-2"
    >
      {fields.map((field) => (
        <div key={field.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{field.label}</dt>
          <dd
            className="truncate text-sm text-foreground"
            {...(field.ltr === true ? { dir: 'ltr' as const } : {})}
            {...(field.title === undefined ? {} : { title: field.title })}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function AttachmentRow({
  attachment,
  readOnly,
  disabled,
  onRemove,
}: {
  attachment: DocumentAttachmentResponse
  readOnly: boolean
  disabled: boolean
  onRemove: (attachment: DocumentAttachmentResponse) => void
}) {
  return (
    <li
      data-slot="attachment-row"
      data-testid="attachment-row"
      className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-ivory"
      >
        <IconFileText className="size-5 text-stone" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" data-testid="attachment-name">
          {attachment.originalFilename}
        </p>
        <p className="truncate text-xs text-muted-foreground" data-testid="attachment-meta">
          {formatFileSize(attachment.fileSize)} — {formatDate(attachment.uploadedAtUtc)}
        </p>
      </div>
      {readOnly ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`حذف المرفق ${attachment.originalFilename}`}
          onClick={() => onRemove(attachment)}
        >
          <IconTrash aria-hidden />
        </Button>
      )}
    </li>
  )
}

function PendingUploadRow({
  pending,
  isUploading,
  uploadError,
  readOnly,
  disabled,
  onRetry,
  onCancel,
}: {
  pending: PendingAttachmentUpload
  isUploading: boolean
  uploadError: string | null | undefined
  readOnly: boolean
  disabled: boolean
  onRetry: (pending: PendingAttachmentUpload) => void
  onCancel: (file: File) => void
}) {
  const { file, attachmentType, failed = false } = pending
  const uploading = !failed && isUploading

  return (
    <li
      data-slot="pending-upload-row"
      data-testid="pending-upload-row"
      data-failed={failed || undefined}
      className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-ivory"
      >
        <IconFileText className="size-5 text-stone" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
      </div>

      {failed ? (
        <p role="alert" data-testid="pending-upload-error" className="text-sm text-destructive">
          {uploadError ?? DEFAULT_UPLOAD_ERROR}
        </p>
      ) : uploading ? (
        <LoadingSpinner size="sm" label="جارٍ الرفع..." />
      ) : (
        <span className="text-xs text-muted-foreground">في الانتظار...</span>
      )}

      {failed && !readOnly ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          data-testid="pending-upload-retry"
          onClick={() => onRetry(pending)}
        >
          <IconRotate aria-hidden />
          إعادة المحاولة
        </Button>
      ) : null}

      {readOnly ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`إلغاء رفع ${file.name}`}
          onClick={() => onCancel(file)}
        >
          <IconX aria-hidden />
        </Button>
      )}

      <span className="sr-only">
        {attachmentType === 'SignedOriginal' ? 'النسخة الموقعة' : 'ملف داعم'}
      </span>
    </li>
  )
}

function AttachmentSection({
  titleId,
  title,
  description,
  maxFiles,
  maxSizeBytes,
  accept,
  attachments,
  pendingOfType,
  isUploading,
  uploadError,
  readOnly,
  disabled,
  onFilesChange,
  onRemove,
  onRetry,
  onCancel,
}: {
  titleId: string
  title: string
  description: string
  maxFiles: number
  maxSizeBytes?: number | undefined
  accept?: Record<string, string[]> | undefined
  attachments: readonly DocumentAttachmentResponse[]
  pendingOfType: readonly PendingAttachmentUpload[]
  isUploading: boolean
  uploadError: string | null | undefined
  readOnly: boolean
  disabled: boolean
  onFilesChange: (files: File[]) => void
  onRemove: (attachment: DocumentAttachmentResponse) => void
  onRetry: (pending: PendingAttachmentUpload) => void
  onCancel: (file: File) => void
}) {
  const inputId = useId()

  return (
    <section
      aria-labelledby={titleId}
      data-slot="attachment-section"
      data-testid={maxFiles === 1 ? 'attachment-section-signed' : 'attachment-section-supporting'}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="text-base font-semibold text-foreground">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {readOnly ? null : (
        <FileDropzone
          inputId={inputId}
          maxFiles={maxFiles}
          disabled={disabled || isUploading}
          onFilesChange={onFilesChange}
          // The server's own limit wins when provided so the client-side UX gate
          // matches the authoritative server; an absent value keeps the
          // dropzone's default (the client hint only, the server still rejects).
          {...(maxSizeBytes === undefined ? {} : { maxSizeBytes })}
          {...(accept === undefined ? {} : { accept })}
        />
      )}
      <ul className="flex flex-col gap-2">
        {attachments.map((attachment) => (
          <AttachmentRow
            key={attachment.id}
            attachment={attachment}
            readOnly={readOnly}
            disabled={disabled}
            onRemove={onRemove}
          />
        ))}
        {pendingOfType.map((pending, index) => (
          <PendingUploadRow
            key={`${pending.file.name}-${index}`}
            pending={pending}
            isUploading={isUploading}
            uploadError={uploadError}
            readOnly={readOnly}
            disabled={disabled}
            onRetry={onRetry}
            onCancel={onCancel}
          />
        ))}
      </ul>
    </section>
  )
}

function AttachmentPanel({
  attachments,
  pendingUploads,
  onUpload,
  onRemove,
  onCancelPending,
  isUploading,
  uploadError,
  deleteError,
  policy,
  documentStatus,
  readOnly = false,
  disabled = false,
  supportingMaxFiles = 5,
  className,
}: AttachmentPanelProps) {
  const { confirm, element: confirmElement } = useConfirm()
  const signedTitleId = useId()
  const supportingTitleId = useId()

  const signedAttachments = attachments.filter(
    (attachment) => attachment.attachmentType === 'SignedOriginal',
  )
  const supportingAttachments = attachments.filter(
    (attachment) => attachment.attachmentType === 'Supporting',
  )
  const pendingSigned = pendingUploads.filter(
    (pending) => pending.attachmentType === 'SignedOriginal',
  )
  const pendingSupporting = pendingUploads.filter(
    (pending) => pending.attachmentType === 'Supporting',
  )
  const hasSignedOriginal = signedAttachments.length > 0

  const handleRemove = (attachment: DocumentAttachmentResponse) => {
    void (async () => {
      const outcome = await confirm({
        title: 'حذف المرفق',
        message: `سيتم حذف المرفق «${attachment.originalFilename}» نهائياً ولا يمكن التراجع عن هذا الإجراء.`,
        variant: 'destructive',
        confirmLabel: 'حذف',
        cancelLabel: 'إلغاء',
      })
      if (outcome.confirmed) {
        onRemove(attachment)
      }
    })()
  }

  const handleSignedFilesChange = (files: File[]) => {
    if (files.length === 0) return
    const previous = pendingSigned[0]
    if (previous) {
      onCancelPending(previous.file)
    }
    onUpload(files.slice(0, 1), 'SignedOriginal')
  }

  const handleSupportingFilesChange = (files: File[]) => {
    if (files.length === 0) return
    onUpload(files.slice(0, supportingMaxFiles), 'Supporting')
  }

  // F-14: the panel renders the SERVER's attachment limits (max size + allowed
  // content types) instead of a hard-coded 5 MB, falling back to generic Arabic
  // when the policy is absent. The dropzone client gate follows the server value
  // when present; the server response stays the authoritative rejection.
  const limits: AttachmentLimits = {
    maxSizeBytes: policy?.maxSizeBytes ?? null,
    allowedContentTypes: policy?.allowedContentTypes ?? null,
  }
  const dropzoneAccept = acceptForContentTypes(policy?.allowedContentTypes)
  const dropzoneMaxSizeBytes = policy?.maxSizeBytes ?? undefined
  const satisfier = policy?.satisfyingSignedOriginal ?? null

  return (
    <div
      data-slot="attachment-panel"
      data-testid="attachment-panel"
      className={cn('flex flex-col gap-6', className)}
    >
      <GateStatusRow
        policy={policy}
        hasSignedOriginal={hasSignedOriginal}
        documentStatus={documentStatus}
      />

      {satisfier === null ? null : <SignedOriginalSatisfierSummary metadata={satisfier} />}

      <AttachmentSection
        titleId={signedTitleId}
        title="النسخة الأصلية الموقعة"
        description={attachmentSignedDescriptionAr(limits)}
        maxFiles={1}
        maxSizeBytes={dropzoneMaxSizeBytes}
        accept={dropzoneAccept}
        attachments={signedAttachments}
        pendingOfType={pendingSigned}
        isUploading={isUploading}
        uploadError={uploadError}
        readOnly={readOnly}
        disabled={disabled}
        onFilesChange={handleSignedFilesChange}
        onRemove={handleRemove}
        onRetry={(pending) => onUpload([pending.file], pending.attachmentType)}
        onCancel={onCancelPending}
      />

      <AttachmentSection
        titleId={supportingTitleId}
        title="ملفات داعمة"
        description={attachmentSupportingDescriptionAr(limits)}
        maxFiles={supportingMaxFiles}
        maxSizeBytes={dropzoneMaxSizeBytes}
        accept={dropzoneAccept}
        attachments={supportingAttachments}
        pendingOfType={pendingSupporting}
        isUploading={isUploading}
        uploadError={uploadError}
        readOnly={readOnly}
        disabled={disabled}
        onFilesChange={handleSupportingFilesChange}
        onRemove={handleRemove}
        onRetry={(pending) => onUpload([pending.file], pending.attachmentType)}
        onCancel={onCancelPending}
      />

      {deleteError ? (
        <p
          role="alert"
          data-slot="attachment-delete-error"
          data-testid="attachment-delete-error"
          className="text-sm text-destructive"
        >
          {deleteError}
        </p>
      ) : null}

      {confirmElement}
    </div>
  )
}

export { AttachmentPanel }
