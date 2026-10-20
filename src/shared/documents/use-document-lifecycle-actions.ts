import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { documentService } from '@/shared/documents/document-transport'
import { policyAdvisoryMessageAr } from '@/shared/documents/document-policy-gates'
import { useInvalidateDocumentDetail } from '@/shared/documents/use-document-queries'
import type {
  DocumentPolicyAdvisory,
  PostDocumentResponse,
  Uuid,
} from '@/shared/documents/types/document-wire.types'
import { normalizeApiError } from '@/shared/services/api-error'
import {
  isConcurrencyConflict,
  withIdempotencyKey,
  type IdempotencyKey,
} from '@/shared/services/mutation-safety'
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

/**
 * What a successful action actually returned.
 *
 * The real backend is deliberately asymmetric here and the distinction is not
 * cosmetic: `submit` / `return-to-draft` / `reject` / `cancel` answer
 * `EmptyResponse`, `post` answers `PostDocumentResponse` (which carries the
 * post-time `warnings[]` the policy read will NOT show again, because a posted
 * document is no longer a `post` candidate), and `reversals` answers `201 { id }`
 * for the NEW compensating document. Nothing is inferred locally: D-LIFE-01
 * forbids patching the cached document from a transition the UI guessed, so a
 * caller re-reads the document, policy and history after every acknowledgement.
 */
export type LifecycleActionResult =
  | { readonly kind: 'Acknowledged' }
  | { readonly kind: 'Posted'; readonly response: PostDocumentResponse }
  | { readonly kind: 'Reversed'; readonly reversalDocumentId: Uuid }

export interface LifecycleActionMutationApi {
  mutate: (variables: LifecycleActionVariables) => void
  mutateAsync: (variables: LifecycleActionVariables) => Promise<LifecycleActionResult>
  isPending: boolean
  error: Error | null
  reset: () => void
  /**
   * True while the last failure was a 409 CONCURRENT EDIT — the row this client
   * held was already written by another actor. A 409 that reports a state or
   * idempotency conflict is false: nothing here is stale, and recovering by
   * refetching would only hide the real cause.
   */
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
 * Guidance surfaced when the server rejects an action with a CONCURRENT-EDIT 409
 * (D-LIFE-01) — and only then, because it names another user as the writer and a
 * state or idempotency 409 names no writer at all. A business 409 keeps the
 * governed copy for its own code instead.
 */
const CONFLICT_GUIDANCE_AR = 'المستند عدّله مستخدم آخر. أعد تحميل البيانات'

/**
 * Joins the post-time advisories the server returned into one Arabic sentence.
 * Advisory copy is resolved by CODE from the governed table; an unmapped code
 * contributes nothing rather than leaking the server's English prose.
 */
function postWarningsDescriptionAr(warnings: readonly DocumentPolicyAdvisory[]): string | null {
  const sentences = warnings
    .map((advisory) => policyAdvisoryMessageAr(advisory))
    .filter((message): message is string => message !== null)
  return sentences.length === 0 ? null : sentences.join(' ')
}

async function runLifecycleAction(
  kind: LifecycleActionKind,
  documentId: string,
  variables: LifecycleActionVariables,
): Promise<LifecycleActionResult> {
  const idempotentRequest = withIdempotencyKey(variables.idempotencyKey)
  const reason = variables.reason ?? ''
  switch (kind) {
    case 'Submit':
      await documentService.submitDocument(documentId, variables.rowVersion, idempotentRequest)
      return { kind: 'Acknowledged' }
    case 'Post':
      return {
        kind: 'Posted',
        response: await documentService.postDocument(
          documentId,
          variables.rowVersion,
          idempotentRequest,
        ),
      }
    case 'Revise':
      // The live route is `POST /{documentId}/return-to-draft` and it REQUIRES a
      // reason; there is no reason-less revise.
      await documentService.returnToDraft(
        documentId,
        variables.rowVersion,
        reason,
        idempotentRequest,
      )
      return { kind: 'Acknowledged' }
    case 'Reject':
      await documentService.rejectDocument(
        documentId,
        variables.rowVersion,
        reason,
        idempotentRequest,
      )
      return { kind: 'Acknowledged' }
    case 'Cancel':
      await documentService.cancelDocument(
        documentId,
        variables.rowVersion,
        reason,
        idempotentRequest,
      )
      return { kind: 'Acknowledged' }
    case 'Reverse':
      return {
        kind: 'Reversed',
        reversalDocumentId: await documentService.reverseDocument(documentId, idempotentRequest),
      }
  }
}

function toLifecycleActionApi(
  mutation: UseMutationResult<LifecycleActionResult, Error, LifecycleActionVariables>,
): LifecycleActionMutationApi {
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
    isConflict: mutation.error !== null && isConcurrencyConflict(mutation.error),
  }
}

/**
 * One mutation per lifecycle action kind. On success the server is
 * authoritative: no timeline event is appended and no cached document is
 * patched — the scoped detail branch (detail + history + policy) is invalidated
 * and refetched, which is the only state that can be trusted after a transition
 * (D-LIFE-01). Every failure is surfaced as an Arabic toast. Without an active
 * scope the invalidation is guarded away (the detail queries are disabled
 * anyway); without a documentId the mutation fails fast.
 */
function useDocumentLifecycleAction(kind: LifecycleActionKind, documentId: string | null) {
  const { activeScopeCacheKey } = useActiveScopeContext()
  const invalidateDetail = useInvalidateDocumentDetail()

  return useMutation<LifecycleActionResult, Error, LifecycleActionVariables>({
    mutationFn: (variables) => {
      if (documentId === null) {
        return Promise.reject(new Error('documentId is required'))
      }
      return runLifecycleAction(kind, documentId, variables)
    },
    onSuccess: (result) => {
      const title = SUCCESS_TOAST_TITLES_AR[kind]
      if (result.kind === 'Posted') {
        const description = postWarningsDescriptionAr(result.response.warnings)
        toast.success({ title, ...(description === null ? {} : { description }) })
      } else {
        toast.success({ title })
      }
      if (documentId === null || activeScopeCacheKey === undefined) {
        return
      }
      // One invalidation, not two: `useInvalidateDocumentDetail` already covers
      // the whole `document(scope, id)` prefix, which is the detail, history AND
      // policy keys. Issuing it a second time makes every one of those three
      // refetch twice per action, which is three redundant round-trips on a
      // slow government link and nothing gained.
      void invalidateDetail(documentId)
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      const description =
        apiError.detailAr ?? (isConcurrencyConflict(error) ? CONFLICT_GUIDANCE_AR : undefined)
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
