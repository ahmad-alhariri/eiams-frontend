import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { documentService } from '@/shared/documents/document-transport'
import { documentQueryKeys, DOCUMENT_RESOURCE } from '@/shared/documents/use-document-queries'
import { normalizeApiError } from '@/shared/services/api-error'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'
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
 * touching detail/history/policy keys.
 *
 * The list prefix is derived from `queryKeys.scoped` rather than written out as
 * `key[0] === 'scoped' && key[1] === ... && key[3] === 'document'`. A positional
 * predicate hard-codes the factory's internal tuple order, so a change to
 * `scopeParts` or to a resource name in `use-document-queries.ts` would make it
 * silently stop matching — and document list pages would then never refresh
 * after a save, with no error anywhere. Only the one offset that distinguishes a
 * list key from a detail key (the filters object) is read positionally, and it is
 * computed from the prefix length rather than hard-coded
 * (eiams-frontend-xlfs).
 */
async function invalidateDocumentLists(
  queryClient: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
): Promise<void> {
  if (scope === undefined) return
  const listPrefix = queryKeys.scoped(scope, DOCUMENT_RESOURCE, 'documents')
  const filtersIndex = listPrefix.length
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey
      if (key.length <= filtersIndex) return false
      if (!listPrefix.every((part, index) => key[index] === part)) return false
      // A list key carries its filters object right after the prefix; a detail
      // key carries a documentId string in that position instead.
      return typeof key[filtersIndex] === 'object' && key[filtersIndex] !== null
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
