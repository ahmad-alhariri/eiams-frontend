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

import { SIGNED_GATE_MOOT_STATUSES } from '@/shared/documents/document-policy-gates'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { DROPZONE_MAX_SIZE_BYTES, FileDropzone } from '@/shared/feedback/file-dropzone'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import type {
  AttachmentType,
  DocumentAttachment,
  DocumentStatus,
  PolicyBlocker,
} from '@/shared/types/generated/eiams-v1'
import { cn } from '@/shared/utils/class-names'
import { formatDate, formatFileSize } from '@/shared/utils/format'

/** Policy slice consumed by the panel; the server evaluation is authoritative (D-ATT-01). */
export type AttachmentPanelPolicy = {
  signedOriginalSatisfied: boolean
  blockers?: readonly PolicyBlocker[]
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
  attachments: readonly DocumentAttachment[]
  /** Files chosen but not yet confirmed by the server; the parent owns the state. */
  pendingUploads: readonly PendingAttachmentUpload[]
  /** Parent-owned upload mutation; called when the user selects files. */
  onUpload: (files: File[], attachmentType: AttachmentType) => void
  /** Parent-owned delete mutation; called after the destructive confirm. */
  onRemove: (attachment: DocumentAttachment) => void
  /** Instant cancel of a pending (never uploaded) file; no confirm is shown. */
  onCancelPending: (file: File) => void
  /** True while any parent upload mutation is in flight; locks the pickers. */
  isUploading: boolean
  /** Arabic error text from the parent's failed upload mutation. */
  uploadError?: string | null
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
  const signedBlocker = policy?.blockers?.find((blocker) =>
    blocker.code.startsWith('signed_original'),
  )

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
        {signedBlocker?.messageAr ? (
          <p className="text-xs text-muted-foreground">{signedBlocker.messageAr}</p>
        ) : null}
      </div>
    </div>
  )
}

function AttachmentRow({
  attachment,
  readOnly,
  disabled,
  onRemove,
}: {
  attachment: DocumentAttachment
  readOnly: boolean
  disabled: boolean
  onRemove: (attachment: DocumentAttachment) => void
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
          {formatFileSize(attachment.fileSize)} — {formatDate(attachment.uploadedAt)} — بواسطة{' '}
          {attachment.uploadedBy.displayName}
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
  attachments: readonly DocumentAttachment[]
  pendingOfType: readonly PendingAttachmentUpload[]
  isUploading: boolean
  uploadError: string | null | undefined
  readOnly: boolean
  disabled: boolean
  onFilesChange: (files: File[]) => void
  onRemove: (attachment: DocumentAttachment) => void
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
        />
      )}
      <ul className="flex flex-col gap-2">
        {attachments.map((attachment) => (
          <AttachmentRow
            key={attachment.attachmentId}
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

  const handleRemove = (attachment: DocumentAttachment) => {
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

      <AttachmentSection
        titleId={signedTitleId}
        title="النسخة الأصلية الموقعة"
        description={`نسخة واحدة فقط — ${formatFileSize(DROPZONE_MAX_SIZE_BYTES)} كحد أقصى (JPG / PNG / PDF)`}
        maxFiles={1}
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
        description={`ملفات إضافية (JPG / PNG / PDF) — حتى ${formatFileSize(DROPZONE_MAX_SIZE_BYTES)} للملف الواحد`}
        maxFiles={supportingMaxFiles}
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

      {confirmElement}
    </div>
  )
}

export { AttachmentPanel }
