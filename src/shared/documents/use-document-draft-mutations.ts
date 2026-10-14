import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { documentService } from '@/shared/documents/document-transport'
import type { CompleteDraftRequest } from '@/shared/documents/types/document-wire.types'
import {
  DOCUMENT_RESOURCE,
  useInvalidateDocumentDetail,
} from '@/shared/documents/use-document-queries'
import { normalizeApiError } from '@/shared/services/api-error'
import { createIdempotencyKey, withIdempotencyKey } from '@/shared/services/mutation-safety'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

/**
 * Shared draft persistence for every document module (receiving, issue,
 * transfer, adjustment, opening, return).
 *
 * There is exactly ONE write that creates a document together with its lines —
 * `POST /warehouse-documents/complete-draft` — and it answers the whole detail
 * read, so a form that has lines never needs a follow-up fetch. The bare
 * `POST /warehouse-documents` route creates an EMPTY document and answers
 * `201 { id }`; no screen in this system saves a draft without lines, so nothing
 * here calls it.
 *
 * There is no update-draft route at all. A draft that already exists is edited
 * by… nothing: the live API has no `PUT /warehouse-documents/{documentId}`, so
 * a previously saved draft cannot be amended from the UI. This is recorded as a
 * contract gap, not worked around.
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

/** The paper pair the separate `paper-reference` route owns. */
export interface PaperReferenceInput {
  readonly paperDocumentNumber: string
  readonly paperDocumentYear: number
}

export interface CompleteDraftVariables {
  readonly request: CompleteDraftRequest
  /**
   * Written immediately after the draft, because `complete-draft` has no slot
   * for it. `expectedRowVersion` is taken from the detail read that create
   * returned, so the second write is guarded on the version the server just
   * issued rather than on one the browser guessed.
   */
  readonly paperReference?: PaperReferenceInput
}

/**
 * Persists a complete draft (spine + lines + petal) through the idempotent
 * `complete-draft` route, writes the paper reference through its own route, and
 * refreshes the list pages.
 *
 * The route answers the whole detail read, but nothing is written into the detail
 * cache here: the form navigates to the created document afterwards and the
 * detail query fetches it under the ordinary scoped key. Seeding the cache from a
 * mutation response would put a document addressable at a cache key whose scope
 * this hook does not own.
 *
 * A failure in the paper-reference write rejects the mutation, so the page shows
 * one Arabic error and does not navigate to a document whose paper reference was
 * never stored. Two writes, not one, because the backend has two routes.
 *
 * Idempotency: one key per user-approved save. It is minted on the first submit
 * and kept for every retry of that same save — the server, not the browser, owns
 * duplicate detection — and cleared once the server acknowledges, so a later,
 * genuinely different draft from the same mounted form gets its own key.
 */
export function useCompleteDraftMutation() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const invalidateDetail = useInvalidateDocumentDetail()
  const idempotencyKeyRef = useRef<string | null>(null)

  return useMutation({
    mutationFn: (variables: CompleteDraftVariables) => {
      idempotencyKeyRef.current ??= createIdempotencyKey()
      return documentService
        .completeDraft(variables.request, withIdempotencyKey(idempotencyKeyRef.current))
        .then(async (details) => {
          if (variables.paperReference !== undefined) {
            await documentService.updatePaperReference(details.id, {
              expectedRowVersion: details.rowVersion,
              paperDocumentNumber: variables.paperReference.paperDocumentNumber,
              paperDocumentYear: variables.paperReference.paperDocumentYear,
            })
          }
          return details
        })
    },
    onSuccess: async (details) => {
      idempotencyKeyRef.current = null
      await invalidateDocumentLists(queryClient, activeScopeCacheKey)
      await invalidateDetail(details.id)
    },
  })
}

export function documentDraftMutationError(error: unknown): string {
  const normalized = normalizeApiError(error)
  return normalized.titleAr ?? 'تعذر حفظ المستند. حاول مرة أخرى.'
}
