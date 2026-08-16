import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import type {
  AttachmentPanelPolicy,
  PendingAttachmentUpload,
} from '@/shared/documents/attachment-panel'
import { attachmentService } from '@/shared/documents/document-attachment-service'
import { documentQueryKeys, useDocumentDetailQuery } from '@/shared/documents/use-document-queries'
import { normalizeApiError } from '@/shared/services/api-error'
import type { AttachmentType, DocumentAttachment } from '@/shared/types/generated/eiams-v1'

const EMPTY_ATTACHMENTS: readonly DocumentAttachment[] = []

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
   * Arabic message of the most recent failed delete. Surfaced for the caller;
   * the full 409/403 recovery flow lands in a later task.
   */
  deleteError: string | null
}

/**
 * Invalidates the scoped document-detail branch (detail/history/policy of one
 * document) after a mutation. Mirrors the warehouse invalidation pattern: the
 * scoped key factory guarantees the invalidation only touches this scope.
 */
function useInvalidateDocumentDetail() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return useCallback(
    async (documentId: string) => {
      if (activeScopeCacheKey === undefined) return

      await queryClient.invalidateQueries({
        queryKey: documentQueryKeys.document(activeScopeCacheKey, documentId),
        exact: false,
      })
    },
    [queryClient, activeScopeCacheKey],
  )
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
      setUploadError(normalizeApiError(error).titleAr)
      setPendingUploads((previous) =>
        previous.map((pending) => (pending.file === file ? { ...pending, failed: true } : pending)),
      )
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
      setDeleteError(normalizeApiError(error).titleAr)
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
