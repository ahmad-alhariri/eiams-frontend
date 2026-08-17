import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { documentService } from '@/shared/documents/document-transport'
import {
  documentQueryKeys,
  useInvalidateDocumentDetail,
} from '@/shared/documents/use-document-queries'
import { normalizeApiError } from '@/shared/services/api-error'
import {
  isConflictError,
  withIdempotencyKey,
  type IdempotencyKey,
} from '@/shared/services/mutation-safety'
import type { DocumentActionResult, WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import { toast } from '@/shared/ui/toast-manager'

/** The six transition actions the detail page can execute (Edit/attachment actions flow elsewhere). */
export type LifecycleActionKind = 'Submit' | 'Post' | 'Reject' | 'Revise' | 'Cancel' | 'Reverse'

/**
 * Variables shared by every lifecycle mutation: the optimistic-concurrency
 * rowVersion (always taken from the latest cached document) and the retry-safe
 * idempotency key.
 *
 * Idempotency contract: one key per user-approved action execution. The caller
 * generates the key once per action, reuses it for every retry of the same
 * action after an uncertain transport outcome, and never regenerates it on
 * failure — the server, not the browser, owns duplicate detection.
 */
export interface LifecycleActionVariables {
  rowVersion: number
  reason?: string
  idempotencyKey: IdempotencyKey
}

export interface LifecycleActionMutationApi {
  mutate: (variables: LifecycleActionVariables) => void
  mutateAsync: (variables: LifecycleActionVariables) => Promise<DocumentActionResult>
  isPending: boolean
  error: Error | null
  reset: () => void
  /** True while the last failure was a 409 optimistic-concurrency conflict. */
  isConflict: boolean
}

const SUCCESS_TOAST_TITLES_AR: Readonly<Record<LifecycleActionKind, string>> = {
  Submit: 'تم إرسال السند للترحيل بنجاح',
  Post: 'تم ترحيل السند بنجاح',
  Reject: 'تم رفض السند',
  Revise: 'تمت مراجعة السند',
  Cancel: 'تم إلغاء السند',
  Reverse: 'تم عكس السند',
}

/**
 * Guidance surfaced when the server rejects an action with a 409 (D-LIFE-01).
 * The full stale-cache recovery flow lands in t13; this toast is the interim
 * signal that the cached document is no longer authoritative.
 */
const CONFLICT_GUIDANCE_AR = 'المستند عدّله مستخدم آخر. أعد تحميل البيانات'

function runLifecycleAction(
  kind: LifecycleActionKind,
  documentId: string,
  variables: LifecycleActionVariables,
): Promise<DocumentActionResult> {
  const idempotentRequest = withIdempotencyKey(variables.idempotencyKey)
  switch (kind) {
    case 'Submit':
      return documentService.submitDocument(documentId, variables.rowVersion, idempotentRequest)
    case 'Post':
      return documentService.postDocument(documentId, variables.rowVersion, idempotentRequest)
    case 'Revise':
      return documentService.reviseDocument(documentId, variables.rowVersion, idempotentRequest)
    case 'Reject':
      return documentService.rejectDocument(
        documentId,
        variables.rowVersion,
        variables.reason ?? '',
        idempotentRequest,
      )
    case 'Cancel':
      return documentService.cancelDocument(
        documentId,
        variables.rowVersion,
        variables.reason ?? '',
        idempotentRequest,
      )
    case 'Reverse':
      return documentService.reverseDocument(
        documentId,
        variables.rowVersion,
        variables.reason ?? '',
        idempotentRequest,
      )
  }
}

function toLifecycleActionApi(
  mutation: UseMutationResult<DocumentActionResult, Error, LifecycleActionVariables>,
): LifecycleActionMutationApi {
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
    isConflict: mutation.error !== null && isConflictError(mutation.error),
  }
}

/**
 * One mutation per lifecycle action kind. On success the server-returned
 * document is written into the scoped detail branch (server-authoritative, no
 * refetch flicker) and detail/history/policy are invalidated; every failure is
 * surfaced as an Arabic toast. Without an active scope the cache write is
 * guarded away (the detail queries are disabled anyway); without a documentId
 * the mutation fails fast.
 */
function useDocumentLifecycleAction(kind: LifecycleActionKind, documentId: string | null) {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  const invalidateDetail = useInvalidateDocumentDetail()

  return useMutation<DocumentActionResult, Error, LifecycleActionVariables>({
    mutationFn: (variables) => {
      if (documentId === null) {
        return Promise.reject(new Error('documentId is required'))
      }
      return runLifecycleAction(kind, documentId, variables)
    },
    onSuccess: (result) => {
      toast.success({ title: SUCCESS_TOAST_TITLES_AR[kind] })
      if (documentId === null || activeScopeCacheKey === undefined) {
        return
      }
      queryClient.setQueryData<WarehouseDocument>(
        documentQueryKeys.document(activeScopeCacheKey, documentId),
        result.document,
      )
      void invalidateDetail(documentId)
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      const description =
        apiError.detailAr ?? (isConflictError(error) ? CONFLICT_GUIDANCE_AR : undefined)
      toast.error({
        title: apiError.titleAr,
        ...(description === undefined ? {} : { description }),
      })
    },
  })
}

export function useSubmitDocumentMutation(documentId: string | null): LifecycleActionMutationApi {
  return toLifecycleActionApi(useDocumentLifecycleAction('Submit', documentId))
}

export function usePostDocumentMutation(documentId: string | null): LifecycleActionMutationApi {
  return toLifecycleActionApi(useDocumentLifecycleAction('Post', documentId))
}

export function useRejectDocumentMutation(documentId: string | null): LifecycleActionMutationApi {
  return toLifecycleActionApi(useDocumentLifecycleAction('Reject', documentId))
}

export function useReviseDocumentMutation(documentId: string | null): LifecycleActionMutationApi {
  return toLifecycleActionApi(useDocumentLifecycleAction('Revise', documentId))
}

export function useCancelDocumentMutation(documentId: string | null): LifecycleActionMutationApi {
  return toLifecycleActionApi(useDocumentLifecycleAction('Cancel', documentId))
}

export function useReverseDocumentMutation(documentId: string | null): LifecycleActionMutationApi {
  return toLifecycleActionApi(useDocumentLifecycleAction('Reverse', documentId))
}
