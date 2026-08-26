import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { adjustmentService } from '@/modules/adjustment/services/adjustment.service'
import { normalizeApiError } from '@/shared/services/api-error'
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
 * Idempotency: one key per user-approved execution, generated here per
 * mutate() call; the server owns duplicate detection and replays.
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
    void queryClient.invalidateQueries({
      queryKey: [
        'scoped',
        activeScopeCacheKey.kind,
        'id' in activeScopeCacheKey ? activeScopeCacheKey.id : null,
      ],
    })
  }
}

/** Posts a Draft adjustment (`POST /adjustments/{id}/post`, idempotent). */
export function usePostAdjustmentAction(adjustmentId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAdjustmentScope()
  return useMutation<AdjustmentPostResult, Error, AdjustPostVariables>({
    mutationFn: (variables) => {
      if (adjustmentId === null) {
        return Promise.reject(new Error('adjustmentId is required'))
      }
      return adjustmentService.postAdjustment(
        adjustmentId,
        variables.rowVersion,
        createIdempotencyKey(),
      )
    },
    onSuccess: (result) => {
      toast.success({ title: 'تم ترحيل سند التسوية بنجاح' })
      // Authoritative post result: cache the posted adjustment so the detail
      // view reflects terminal state without waiting for refetch.
      queryClient.invalidateQueries({ queryKey: ['scoped'] })
      void result
      invalidate()
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      toast.error({
        title: apiError.titleAr,
        ...(apiError.detailAr !== undefined
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
  return useMutation<AdjustmentReverseResult, Error, AdjustReverseVariables>({
    mutationFn: (variables) => {
      if (adjustmentId === null) {
        return Promise.reject(new Error('adjustmentId is required'))
      }
      return adjustmentService.reverseAdjustment(
        adjustmentId,
        variables.rowVersion,
        variables.reason,
        createIdempotencyKey(),
      )
    },
    onSuccess: () => {
      toast.success({ title: 'تم عكس السند وإنشاء السند المقابل' })
      invalidate()
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      toast.error({
        title: apiError.titleAr,
        ...(apiError.detailAr !== undefined
          ? { description: apiError.detailAr }
          : isConflictError(error)
            ? { description: CONFLICT_GUIDANCE_AR }
            : {}),
      })
    },
  })
}

export type { IdempotencyKey }
