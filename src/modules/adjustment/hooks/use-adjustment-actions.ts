import { useMutation } from '@tanstack/react-query'
import { useRef } from 'react'
import { useNavigate } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { useAdjustmentInvalidation } from '@/modules/adjustment/hooks/use-adjustment-queries'
import { adjustmentService } from '@/modules/adjustment/services/adjustment.service'
import { reportApiError } from '@/shared/services/api-error'
import {
  createIdempotencyKey,
  isConflictError,
  type IdempotencyKey,
} from '@/shared/services/mutation-safety'
import { toast } from '@/shared/ui/toast-manager'
import type { PostDocumentResponse } from '@/shared/documents/types/document-wire.types'
import type { ResourceIdResponse } from '@/shared/api/api-contracts'

/**
 * Manager-owned adjustment posting flow (e21-t06). Mirrors the shared
 * document lifecycle hooks' UX contract (success/error toasts, optimistic-
 * concurrency guidance) against the `/adjustments` endpoint family — the
 * generic Submit/Cancel/Reject transitions do not exist for adjustments
 * (D-ADJ-01): the only manager actions are Post and Reverse.
 *
 * Idempotency: one key per user-approved execution. The key is minted on the
 * FIRST `mutate()` of an action and held in a ref, so an explicit retry after
 * an uncertain transport outcome reuses the SAME key the server already saw —
 * the API, not the browser, owns duplicate detection and replay (D-LIFE-01
 * §94-97). It is cleared only on success, so a new user action starts a new
 * idempotency context. This is the same contract
 * `src/shared/documents/pages/document-detail-page.tsx` implements for the
 * six generic lifecycle actions.
 *
 * Conflict recovery: a 409 means the server rejected the request against its
 * current state, so the cached read model is stale by definition. Per
 * D-LIFE-01 §226 rule 6 the authoritative scoped state is refetched and the
 * Arabic-safe conflict message is shown. There is no optimistic UI state to
 * discard — this repo performs no `onMutate`/`updateQueryData` writes — and no
 * automatic retry is issued, because a 409 may be a stale row version, a state
 * conflict, or an idempotency conflict, and only the user can resolve which.
 */

export const ADJUSTMENT_CONFLICT_GUIDANCE_AR = 'سند التسوية عدّله مستخدم آخر. أعد تحميل البيانات'

export interface AdjustPostVariables {
  rowVersion: number
}

export interface AdjustReverseVariables {
  rowVersion: number
  /** Mandatory reversal rationale — the server rejects an empty reason. */
  reason: string
}

/** Posts a Draft adjustment (`POST /adjustments/{id}/post`, idempotent). */
export function usePostAdjustmentAction(adjustmentId: string | null) {
  const invalidate = useAdjustmentInvalidation()
  // One retry-safe idempotency context for this action. Minted on the first
  // execution, kept across a failure, cleared only on success.
  const idempotencyKeyRef = useRef<IdempotencyKey | null>(null)
  return useMutation<PostDocumentResponse, Error, AdjustPostVariables>({
    mutationFn: (variables) => {
      if (adjustmentId === null) {
        return Promise.reject(new Error('adjustmentId is required'))
      }
      idempotencyKeyRef.current ??= createIdempotencyKey()
      return adjustmentService.postAdjustment(
        adjustmentId,
        variables.rowVersion,
        idempotencyKeyRef.current,
      )
    },
    onSuccess: (result) => {
      idempotencyKeyRef.current = null
      toast.success({ title: 'تم ترحيل سند التسوية بنجاح' })
      // The shared adjustment policy (`useAdjustmentInvalidation`) invalidates
      // exactly the resources a post can change, in this scope. It replaced the
      // blanket `['scoped']` sweep, which matched every scoped key regardless of
      // scope (eiams-frontend-xlfs, eiams-frontend-jkel).
      void result
      invalidate()
    },
    onError: (error) => {
      if (isConflictError(error)) {
        // D-LIFE-01 §226 rule 6: the server refused the request against its own
        // current state, so every cached adjustment read in this scope is
        // stale — refetch authoritative state before the user acts again.
        invalidate()
      }
      reportApiError(error, { conflictGuidanceAr: ADJUSTMENT_CONFLICT_GUIDANCE_AR })
    },
  })
}

/**
 * Reverses a Posted ordinary adjustment through a compensating document
 * (`POST /adjustments/{id}/reverse`, idempotent, reasoned). Disposal is not
 * reversible — the UI never offers the action there and the server rejects it.
 *
 * The server answers with the compensating document's id (201 `{ id }`), and
 * that document is the ONLY place the reversal can be finished: its signed
 * original is uploaded and it is posted from its own page. The reversed source
 * page is terminal and offers no action, so a successful reversal navigates to
 * the compensating document — otherwise the new document is unreachable from
 * the UI (F15).
 */
export function useReverseAdjustmentAction(adjustmentId: string | null) {
  const invalidate = useAdjustmentInvalidation()
  const navigate = useNavigate()
  const idempotencyKeyRef = useRef<IdempotencyKey | null>(null)
  return useMutation<ResourceIdResponse, Error, AdjustReverseVariables>({
    mutationFn: (variables) => {
      if (adjustmentId === null) {
        return Promise.reject(new Error('adjustmentId is required'))
      }
      idempotencyKeyRef.current ??= createIdempotencyKey()
      return adjustmentService.reverseAdjustment(
        adjustmentId,
        variables.rowVersion,
        variables.reason,
        idempotencyKeyRef.current,
      )
    },
    onSuccess: (result) => {
      idempotencyKeyRef.current = null
      toast.success({ title: 'تم عكس السند وإنشاء السند المقابل' })
      invalidate()
      navigate(ROUTE_PATHS.adjustmentDetail.replace(':adjustmentId', result.id))
    },
    onError: (error) => {
      if (isConflictError(error)) {
        invalidate()
      }
      reportApiError(error, { conflictGuidanceAr: ADJUSTMENT_CONFLICT_GUIDANCE_AR })
    },
  })
}

export type { IdempotencyKey }
