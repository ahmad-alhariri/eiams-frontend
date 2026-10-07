import { useCallback, useState } from 'react'

export interface CountConflictRecovery {
  conflict: {
    /** A 409 was reported and the operator has not yet chosen what to do. */
    active: boolean
    /** The chosen recovery refetch is in flight. */
    isRefreshing: boolean
  }
  /** Called by the save path when the mutation failed with a conflict. */
  reportConflict: () => void
  /**
   * Load the authoritative count and lines. The operator chose this explicitly,
   * so any in-progress entries are intentionally replaced by the server's state.
   * Never rejects: a failed refetch still closes the dialog and the inline
   * Arabic error from the mutation already said what happened.
   */
  recover: () => Promise<void>
  /**
   * Stay on what is on screen and keep every unsaved entry. Deliberately does
   * NOT refetch. Documented trade-off: the visible rows may still be behind the
   * server, so a further save can 409 again — which is the honest outcome when
   * the response does not say whether the previous batch applied.
   */
  dismiss: () => void
}

export interface CountConflictRecoveryOptions {
  /** Refetches the count header, which is where the session `rowVersion` lives. */
  refetchCount: () => Promise<unknown>
  /** Refetches the count-lines page currently on screen. */
  refetchLines: () => Promise<unknown>
  /** When false the recovery is inert, so a read-only viewer is unaffected. */
  enabled?: boolean
}

/**
 * Neutral conflict recovery for the count quantity-entry workspace
 * (eiams-frontend-3wv1).
 *
 * Mirrors `useDocumentConflictRecovery`, and keeps the same deliberate
 * neutrality: neither this hook nor the dialog it drives claims that the
 * rejected save was applied or not applied. A `409` from
 * `PUT /inventory-counts/{countId}/lines` is returned for a stale session or
 * line version, and the response carries no per-line attribution, so "some of
 * your lines were saved" would be a fabricated fact. What the operator can be
 * told is that the server rejected the save against its own current state.
 *
 * The feature-specific part is which keys are refetched; the neutral dialog and
 * its focus contract are shared, so the two features that need this affordance
 * do not carry two copies of it.
 *
 * It deliberately does NOT participate in the save mutation's `onError`. The
 * mutation is left without error-path invalidation on purpose: the workspace
 * feeds `values` to react-hook-form, so any refetch that changed the loaded
 * lines would trigger a form reset and silently discard the operator's
 * unsaved entries. Reporting the conflict here, and refetching only when the
 * operator asks for it, is what keeps the drafts.
 */
export function useCountConflictRecovery({
  enabled = true,
  refetchCount,
  refetchLines,
}: CountConflictRecoveryOptions): CountConflictRecovery {
  const [active, setActive] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const reportConflict = useCallback(() => {
    if (enabled) {
      setActive(true)
    }
  }, [enabled])

  const recover = useCallback(async () => {
    if (!enabled) {
      return
    }
    setIsRefreshing(true)
    try {
      // `allSettled`, not `all`: a failed refetch must not strand the dialog in
      // a permanent busy state. The server may be unreachable entirely, and the
      // operator still needs the dialog to close.
      await Promise.allSettled([refetchCount(), refetchLines()])
    } finally {
      setIsRefreshing(false)
      setActive(false)
    }
  }, [enabled, refetchCount, refetchLines])

  const dismiss = useCallback(() => {
    setActive(false)
  }, [])

  return { conflict: { active, isRefreshing }, reportConflict, recover, dismiss }
}
