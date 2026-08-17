import { useCallback, useEffect, useRef, useState } from 'react'

import {
  useDocumentDetailQuery,
  useDocumentPolicyQuery,
} from '@/shared/documents/use-document-queries'

export interface DocumentConflictRecoveryOptions {
  /**
   * Mirrors the page's query gating (same key + same flag → TanStack dedupes
   * to one fetch). `false` for unknown routes/absent ids so the recovery
   * observers never fire requests the page itself would not fire.
   */
  enabled?: boolean
}

export interface DocumentConflictRecovery {
  /** UI state surfaced by the routed page; not server state (stays local). */
  conflict: {
    /** True while a lifecycle mutation has 409'd and the user has not resolved it. */
    active: boolean
    /** True while `recover()` is refetching detail + policy. */
    isRefreshing: boolean
  }
  /**
   * Called by the page when a lifecycle mutation fails with a 409: starts the
   * recovery flow (surfaces the conflict dialog). No-op without a documentId.
   */
  reportConflict: () => void
  /**
   * Refetches the fresh detail + policy through the shared queries (the page
   * observes the same keys, so the cache update lands in both) and clears the
   * conflict flag once both settle. Returns when refreshed. Never rejects:
   * a failed refetch still closes the dialog and keeps the stale view — the
   * mutation's Arabic error toast already told the user what happened.
   */
  recover: () => Promise<void>
  /**
   * User chose to stay on the stale view: clears the conflict flag WITHOUT
   * refetching. Documented trade-off: the cache is still stale, so a further
   * lifecycle action may 409 again (the dialog will simply reappear).
   */
  dismiss: () => void
}

/**
 * Conflict-recovery coordinator for the shared document detail page (e12-t13).
 *
 * Owns ONLY the recovery UI state and the composed refetch; the page owns
 * mutation execution. The hook reuses `useDocumentDetailQuery` +
 * `useDocumentPolicyQuery` with the page's exact keys and enabled flag, so
 * TanStack dedupes to one network fetch per key while this hook and the page
 * share the refetched cache. Latest values are tracked in refs so the exposed
 * callbacks stay stable across renders.
 */
export function useDocumentConflictRecovery(
  documentId: string | null,
  options: DocumentConflictRecoveryOptions = {},
): DocumentConflictRecovery {
  const queryOptions = options.enabled === undefined ? {} : { enabled: options.enabled }
  const detailQuery = useDocumentDetailQuery(documentId, queryOptions)
  const policyQuery = useDocumentPolicyQuery(documentId, queryOptions)

  const [active, setActive] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const documentIdRef = useRef<string | null>(documentId)
  useEffect(() => {
    documentIdRef.current = documentId
  }, [documentId])

  const refreshingRef = useRef(false)

  const refetchRef = useRef<(() => Promise<unknown>) | undefined>(undefined)
  useEffect(() => {
    refetchRef.current = () => Promise.all([detailQuery.refetch(), policyQuery.refetch()])
  })

  const reportConflict = useCallback(() => {
    if (documentIdRef.current === null) {
      return
    }
    setActive(true)
  }, [])

  const recover = useCallback(async (): Promise<void> => {
    if (documentIdRef.current === null || refreshingRef.current) {
      return
    }
    refreshingRef.current = true
    setActive(true)
    setIsRefreshing(true)
    try {
      const refetch = refetchRef.current
      if (refetch !== undefined) {
        await refetch()
      }
    } finally {
      refreshingRef.current = false
      setActive(false)
      setIsRefreshing(false)
    }
  }, [])

  const dismiss = useCallback(() => {
    setActive(false)
  }, [])

  return {
    conflict: { active, isRefreshing },
    reportConflict,
    recover,
    dismiss,
  }
}
