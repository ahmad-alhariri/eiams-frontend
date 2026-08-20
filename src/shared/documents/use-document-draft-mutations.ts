import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { documentService } from '@/shared/documents/document-transport'
import { documentQueryKeys } from '@/shared/documents/use-document-queries'
import { normalizeApiError } from '@/shared/services/api-error'
import { type ScopeCacheKey } from '@/shared/services/query-keys'
import type {
  WarehouseDocument,
  WarehouseDocumentDraftRequest,
} from '@/shared/types/generated/eiams-v1'

/**
 * Shared draft persistence for every document module (receiving, issue,
 * transfer, adjustment). The spine draft endpoints are contract-owned by the
 * shared document engine — module petals only contribute a
 * `WarehouseDocumentDraftRequest` — so create/update live here once.
 */

/**
 * Invalidates every scoped document-list page (all filter variants) without
 * touching detail/history/policy keys: list keys carry a filters object at
 * index 5, document keys a documentId string.
 */
async function invalidateDocumentLists(
  queryClient: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
): Promise<void> {
  if (scope === undefined) return
  const scopeId = scope.kind === 'enterprise' ? null : scope.id
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey
      return (
        key[0] === 'scoped' &&
        key[1] === scope.kind &&
        key[2] === scopeId &&
        key[3] === 'document' &&
        key[4] === 'documents' &&
        typeof key[5] === 'object' &&
        key[5] !== null
      )
    },
  })
}

/** Creates a new draft (POST /warehouse-documents) and refreshes the lists. */
export function useCreateDocumentMutation() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return useMutation({
    mutationFn: (request: WarehouseDocumentDraftRequest) => documentService.createDocument(request),
    onSuccess: async () => {
      await invalidateDocumentLists(queryClient, activeScopeCacheKey)
    },
  })
}

/**
 * Updates an existing draft (PUT /warehouse-documents/:documentId) and
 * refreshes both the list pages and the edited document's detail branch.
 */
export function useUpdateDocumentMutation() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return useMutation({
    mutationFn: (request: { documentId: string; request: WarehouseDocumentDraftRequest }) =>
      documentService.updateDocument(request.documentId, request.request),
    onSuccess: async (document: WarehouseDocument) => {
      await invalidateDocumentLists(queryClient, activeScopeCacheKey)
      if (activeScopeCacheKey === undefined) return
      await queryClient.invalidateQueries({
        queryKey: documentQueryKeys.document(activeScopeCacheKey, document.documentId),
        exact: false,
      })
    },
  })
}

export function documentDraftMutationError(error: unknown): string {
  const normalized = normalizeApiError(error)
  return normalized.titleAr ?? 'تعذر حفظ المستند. حاول مرة أخرى.'
}
