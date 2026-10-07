import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  AttachmentPanelPolicy,
  PendingAttachmentUpload,
} from '@/shared/documents/attachment-panel'
import { attachmentService } from '@/shared/documents/document-attachment-service'
import {
  useDocumentDetailQuery,
  useInvalidateDocumentDetail,
} from '@/shared/documents/use-document-queries'
import { normalizeApiError } from '@/shared/services/api-error'
import { isConflictError } from '@/shared/services/mutation-safety'
import type { AttachmentType, DocumentAttachment } from '@/shared/types/generated/eiams-v1'

const EMPTY_ATTACHMENTS: readonly DocumentAttachment[] = []

/**
 * Arabic feedback for a failed attachment mutation: the server's own
 * `detailAr` when the problem carries one, otherwise the generic `titleAr`
 * (e24-t10 / B2). The previous code kept only `titleAr`, so the specific
 * Arabic reason the server sent — "another user edited this document", for
 * example — was discarded and the user saw a bare "the data changed".
 * Nothing is invented here: a problem with no `detailAr` still renders
 * `titleAr`, which is the contract's own sentence.
 */
function attachmentErrorMessageAr(error: unknown): string {
  const apiError = normalizeApiError(error)
  return apiError.detailAr ?? apiError.titleAr
}

/**
 * Panel-compatible manager shape produced by `useDocumentAttachmentManager`.
 * The plain state (state updates for pending rows) is ours; every server
 * read/write flows through the detail query and the attachment mutations.
 */
export interface DocumentAttachmentManager {
  attachments: readonly DocumentAttachment[]
  pendingUploads: readonly PendingAttachmentUpload[]
  onUpload: (files: File[], attachmentType: AttachmentType) => void
  onRemove: (attachment: DocumentAttachment) => void
  onCancelPending: (file: File) => void
  isUploading: boolean
  uploadError: string | null
  policy: AttachmentPanelPolicy | null
  readOnly: boolean
  disabled: boolean
  /**
   * Arabic message of the most recent failed delete, preferring the server's
   * `detailAr`. Surfaced to the caller, which renders it in the panel's
   * `role="alert"` region (e24-t10 / B1). A 409 additionally refetches the
   * scoped detail/policy/attachments branch, so a stale rowVersion or policy
   * cannot be re-submitted against a document the panel is still describing.
   */
  deleteError: string | null
}

function isUploadable(document: { documentStatus: string } | undefined): boolean {
  return document?.documentStatus === 'Draft'
}

/**
 * Integrates the presentational `AttachmentPanel` with the document engine:
 * owns pending-upload rows, runs the upload/delete mutations against the
 * contract endpoints, keeps the detail query fresh, and derives the policy
 * slice and mutable-window flags from the loaded document.
 *
 * Pending rows are keyed by `File` object identity: a retry passes the same
 * `pending.file` reference back through `onUpload`, so the existing failed
 * entry is reused instead of duplicated. Mutations are gated on a loaded
 * Draft document; a `null` documentId renders a zero-network manager.
 *
 * Failure feedback (e24-t10 / B2): both mutations report the server's
 * `detailAr` when the problem carries one, falling back to its `titleAr`. On a
 * 409 — and only a 409, per
 * `docs/feature-service-composition-standard.md:87-91` — the scoped
 * detail/policy/attachments branch is refetched, because a conflict means the
 * cached document the panel is rendering is no longer authoritative. This is
 * the same `useInvalidateDocumentDetail` recovery the lifecycle mutations use;
 * nothing is retried automatically and no state is written optimistically.
 */
export function useDocumentAttachmentManager(documentId: string | null): DocumentAttachmentManager {
  const detailQuery = useDocumentDetailQuery(documentId)
  const invalidateDetail = useInvalidateDocumentDetail()
  const document = detailQuery.data

  const [pendingUploads, setPendingUploads] = useState<PendingAttachmentUpload[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const pendingRef = useRef(pendingUploads)
  useEffect(() => {
    pendingRef.current = pendingUploads
  }, [pendingUploads])

  /**
   * D-LIFE-01 rule 6: a 409 means the cached document is stale, so the
   * authoritative detail/policy/attachments are refetched. Scoped to 409 —
   * a 403 or a network failure says nothing about document freshness, and
   * `docs/feature-service-composition-standard.md:87-91` forbids assuming a
   * cause a problem did not report.
   */
  const recoverFromConflict = useCallback(
    (error: unknown) => {
      if (documentId === null || !isConflictError(error)) return
      void invalidateDetail(documentId)
    },
    [documentId, invalidateDetail],
  )

  const uploadMutation = useMutation({
    mutationFn: ({ file, attachmentType }: { file: File; attachmentType: AttachmentType }) =>
      attachmentService.uploadAttachment(
        documentId ?? '',
        file,
        attachmentType,
        document?.rowVersion ?? 0,
      ),
    onSuccess: (_attachment, { file }) => {
      setUploadError(null)
      setPendingUploads((previous) => previous.filter((pending) => pending.file !== file))
      if (documentId !== null) {
        void invalidateDetail(documentId)
      }
    },
    onError: (error, { file }) => {
      setUploadError(attachmentErrorMessageAr(error))
      setPendingUploads((previous) =>
        previous.map((pending) => (pending.file === file ? { ...pending, failed: true } : pending)),
      )
      recoverFromConflict(error)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (attachment: DocumentAttachment) =>
      attachmentService.deleteAttachment(
        documentId ?? '',
        attachment.attachmentId,
        document?.rowVersion ?? 0,
      ),
    onSuccess: () => {
      setDeleteError(null)
      if (documentId !== null) {
        void invalidateDetail(documentId)
      }
    },
    onError: (error) => {
      setDeleteError(attachmentErrorMessageAr(error))
      recoverFromConflict(error)
    },
  })

  const onUpload = useCallback(
    (files: File[], attachmentType: AttachmentType) => {
      if (documentId === null || !isUploadable(document)) return

      setPendingUploads((previous) => {
        const alreadyPending = new Set(previous.map((pending) => pending.file))
        const fresh = files.filter((file) => !alreadyPending.has(file))
        return fresh.length === 0
          ? previous
          : [...previous, ...fresh.map((file) => ({ file, attachmentType }))]
      })
      for (const file of files) {
        uploadMutation.mutate({ file, attachmentType })
      }
    },
    [documentId, document, uploadMutation],
  )

  const onRemove = useCallback(
    (attachment: DocumentAttachment) => {
      if (documentId === null || !isUploadable(document)) return

      deleteMutation.mutate(attachment)
    },
    [documentId, document, deleteMutation],
  )

  const onCancelPending = useCallback((file: File) => {
    const entry = pendingRef.current.find((pending) => pending.file === file)
    if (entry?.failed === true) {
      setUploadError(null)
    }
    setPendingUploads((previous) => previous.filter((pending) => pending.file !== file))
  }, [])

  return {
    attachments: document?.attachments ?? EMPTY_ATTACHMENTS,
    pendingUploads,
    onUpload,
    onRemove,
    onCancelPending,
    isUploading: uploadMutation.isPending,
    uploadError,
    policy: document
      ? {
          signedOriginalSatisfied: document.policy.signedOriginalSatisfied,
          blockers: document.policy.blockers,
        }
      : null,
    readOnly: document?.documentStatus !== 'Draft',
    disabled: document === undefined || detailQuery.isFetching,
    deleteError,
  }
}
