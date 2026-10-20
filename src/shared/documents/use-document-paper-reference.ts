import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import { documentService } from '@/shared/documents/document-transport'
import { useInvalidateDocumentDetail } from '@/shared/documents/use-document-queries'
import type { UpdatePaperReferenceRequest } from '@/shared/documents/types/document-wire.types'

/**
 * Writes the paper reference (number + year) of an existing document through
 * `PUT /{documentId}/paper-reference`. The server accepts this write only on a
 * Draft — this hook keeps no status guard of its own so the DRAFT policy stays
 * server-owned, exactly like the lifecycle actions.
 *
 * On success the scoped detail branch (detail + history + policy) is
 * invalidated so the header re-renders server data (D-LIFE-01: nothing is
 * patched locally). On failure no toast fires here: the editor renders the
 * Arabic error inline, and a 409 optimistic-concurrency conflict additionally
 * flows to the routed page's conflict-recovery dialog through the `onConflict`
 * entry point its caller owns.
 */
export function useUpdatePaperReferenceMutation(
  documentId: string | null,
): UseMutationResult<void, Error, UpdatePaperReferenceRequest> {
  const invalidateDetail = useInvalidateDocumentDetail()

  return useMutation<void, Error, UpdatePaperReferenceRequest>({
    mutationFn: (request) => {
      if (documentId === null) {
        return Promise.reject(new Error('documentId is required'))
      }
      return documentService.updatePaperReference(documentId, request)
    },
    onSuccess: () => {
      if (documentId === null) {
        return
      }
      void invalidateDetail(documentId)
    },
  })
}
