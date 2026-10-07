import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { adjustmentService } from '@/modules/adjustment/services/adjustment.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { invalidateScopedQueries } from '@/shared/services/query-keys'
import {
  createIdempotencyKey,
  isConflictError,
  type IdempotencyKey,
} from '@/shared/services/mutation-safety'
import { toast } from '@/shared/ui/toast-manager'
import type {
  AdjustmentPostResult,
  AdjustmentReverseResult,
} from '@/shared/types/generated/eiams-v1'

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

const CONFLICT_GUIDANCE_AR = 'سند التسوية عدّله مستخدم آخر. أعد تحميل البيانات'

export interface AdjustPostVariables {
  rowVersion: number
}

export interface AdjustReverseVariables {
  rowVersion: number
  /** Mandatory reversal rationale — the server rejects an empty reason. */
  reason: string
}

function useInvalidateAdjustmentScope() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()
  return () => {
    if (activeScopeCacheKey === undefined) return
    // The shared helper, not a hand-derived `['scoped', kind, id]` array. A
    // hand-rolled copy can silently diverge from `queryKeys.scoped`'s shape and
    // then match nothing, which is the failure filed as eiams-frontend-jkel
    // (eiams-frontend-xlfs).
    void invalidateScopedQueries(queryClient, activeScopeCacheKey)
  }
}

/** Posts a Draft adjustment (`POST /adjustments/{id}/post`, idempotent). */
export function usePostAdjustmentAction(adjustmentId: string | null) {
  const invalidate = useInvalidateAdjustmentScope()
  // One retry-safe idempotency context for this action. Minted on the first
  // execution, kept across a failure, cleared only on success.
  const idempotencyKeyRef = useRef<IdempotencyKey | null>(null)
  return useMutation<AdjustmentPostResult, Error, AdjustPostVariables>({
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
      // The scoped invalidation below already covers every count, asset and
      // custody read in this scope, which is what the removed blanket
      // `['scoped']` call was doing. Keeping both was redundant and over-broad
      // (a bare namespace fragment that matches every scoped key regardless of
      // scope) — see docs/immutable-ledgers-audit-verification.md, recorded but
      // not fixed there (eiams-frontend-xlfs).
      void result
      invalidate()
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      if (isConflictError(error)) {
        // D-LIFE-01 §226 rule 6: the server refused the request against its own
        // current state, so every cached adjustment read in this scope is
        // stale — refetch authoritative state before the user acts again.
        invalidate()
      }
      toast.error({
        title: apiError.titleAr,
        // `detailAr` is `string | null` (never `undefined`), so it must be
        // null-checked or the Arabic conflict fallback below is unreachable.
        ...(apiError.detailAr !== null
          ? { description: apiError.detailAr }
          : isConflictError(error)
            ? { description: CONFLICT_GUIDANCE_AR }
            : {}),
      })
    },
  })
}

/**
 * Reverses a Posted ordinary adjustment through a compensating document
 * (`POST /adjustments/{id}/reverse`, idempotent, reasoned). Disposal is not
 * reversible — the UI never offers the action there and the server rejects it.
 */
export function useReverseAdjustmentAction(adjustmentId: string | null) {
  const invalidate = useInvalidateAdjustmentScope()
  const idempotencyKeyRef = useRef<IdempotencyKey | null>(null)
  return useMutation<AdjustmentReverseResult, Error, AdjustReverseVariables>({
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
    onSuccess: () => {
      idempotencyKeyRef.current = null
      toast.success({ title: 'تم عكس السند وإنشاء السند المقابل' })
      invalidate()
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      if (isConflictError(error)) {
        invalidate()
      }
      toast.error({
        title: apiError.titleAr,
        ...(apiError.detailAr !== null
          ? { description: apiError.detailAr }
          : isConflictError(error)
            ? { description: CONFLICT_GUIDANCE_AR }
            : {}),
      })
    },
  })
}

export type { IdempotencyKey }
