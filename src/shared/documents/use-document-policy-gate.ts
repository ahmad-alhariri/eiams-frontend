import { useCallback, useMemo } from 'react'

import { useWarehouseCapabilityValidation } from '@/modules/warehouse/hooks/use-warehouse-capability-validation'
import {
  capabilityOperationForDocumentType,
  evaluateActionDecision,
  evaluateDocumentPreflight,
  toPreflightLineShapes,
  type CapabilityEvaluation,
  type DocumentActionDecision,
  type DocumentPreflight,
  type PreflightLineShape,
} from '@/shared/documents/document-policy-gates'
import { useDocumentLifecyclePermissions } from '@/shared/documents/use-document-permissions'
import {
  useDocumentDetailQuery,
  useDocumentPolicyQuery,
} from '@/shared/documents/use-document-queries'
import type {
  DocumentActionType,
  DocumentPolicy,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'

const EMPTY_PREFLIGHT_LINES: readonly PreflightLineShape[] = []
const EMPTY_CAPABILITY_EVALUATIONS: readonly CapabilityEvaluation[] = []

export interface DocumentPolicyGateOptions {
  enabled?: boolean
  /**
   * Draft line snapshots captured by an edit form (they carry
   * `materialDomainId`). When provided, the preflight gates evaluate these
   * lines (capability included) instead of the server-loaded `document.lines`.
   * When omitted, the read-only preflight applies: server lines never carry
   * `materialDomainId`, so the capability gate is skipped client-side (the
   * server owns capability revalidation at post) and no capabilities request
   * is fired.
   */
  lines?: readonly PreflightLineShape[]
}

export interface DocumentPolicyGateResult {
  document: WarehouseDocument | undefined
  policy: DocumentPolicy | null
  isLoading: boolean
  isError: boolean
  /**
   * Combined client-side preflight verdict. `null` until the policy is
   * loaded; advisories ride through untouched (SoftFreeze warnings only).
   */
  preflight: DocumentPreflight | null
  /** Server policy presentation composed with the session permission gate. */
  decision: (action: DocumentActionType) => DocumentActionDecision
  /** Submit enabled when the policy presents it and the session permits it. */
  canSubmit: boolean
  /** Post enabled when the policy presents it and the session permits it. */
  canPost: boolean
  /** Composed refetch of the shared detail + policy queries. */
  refetch: () => Promise<void>
}

/**
 * Shared document policy-gate coordinator (e12-t12) — the single composition
 * downstream document features (e13–e21) consume for lifecycle-action
 * decisions and preflight blockers/advisories.
 *
 * The coordinator is THIN by design: it reuses `useDocumentDetailQuery` and
 * `useDocumentPolicyQuery` so the cache keys stay shared with the detail page.
 * When the page and the coordinator observe the same keys, TanStack Query
 * dedupes by key — one network fetch, multiple observers (verified in the
 * page tests). It never disables the page's own queries to make itself work.
 *
 * Server state stays in TanStack Query; this hook only composes resolved
 * data. The signed gate is read exclusively from the server policy
 * (D-ATT-01); SoftFreeze advisories are warnings only and never block
 * (inventory-count freeze policy).
 */
export function useDocumentPolicyGate(
  documentId: string | null,
  options: DocumentPolicyGateOptions = {},
): DocumentPolicyGateResult {
  const queryOptions = options.enabled === undefined ? {} : { enabled: options.enabled }
  const detailQuery = useDocumentDetailQuery(documentId, queryOptions)
  const policyQuery = useDocumentPolicyQuery(documentId, queryOptions)
  const permissions = useDocumentLifecyclePermissions()

  const document = detailQuery.data
  const policy = policyQuery.data ?? null

  const serverLines = useMemo<readonly PreflightLineShape[]>(
    () => (document === undefined ? EMPTY_PREFLIGHT_LINES : toPreflightLineShapes(document.lines)),
    [document],
  )
  const effectiveLines = options.lines ?? serverLines

  // Capability preflight participates only when edit-form draft lines carry a
  // material domain. Server-loaded (read-only) documents never do, so no
  // capabilities request is fired for them (and `validates` stays `unknown`).
  const capabilityParticipates = useMemo(
    () =>
      effectiveLines.some(
        (line) =>
          line.materialDomainId !== null &&
          line.materialDomainId !== undefined &&
          line.materialDomainId !== '',
      ),
    [effectiveLines],
  )
  const capabilityValidation = useWarehouseCapabilityValidation(
    capabilityParticipates ? document?.warehouse.id : undefined,
  )
  const { validates } = capabilityValidation

  const capabilityEvaluations = useMemo<readonly CapabilityEvaluation[]>(() => {
    if (!capabilityParticipates || document === undefined) {
      return EMPTY_CAPABILITY_EVALUATIONS
    }
    const operation = capabilityOperationForDocumentType(document.documentType)
    if (operation === undefined) {
      return EMPTY_CAPABILITY_EVALUATIONS
    }
    const domains = new Set<string>()
    for (const line of effectiveLines) {
      const domainId = line.materialDomainId
      if (domainId !== null && domainId !== undefined && domainId !== '') {
        domains.add(domainId)
      }
    }
    return [...domains].map((domainId) => {
      const result = validates(domainId, operation)
      return {
        domainId,
        status: result.status,
        messageAr: result.status === 'blocked' ? result.messageAr : null,
      }
    })
  }, [capabilityParticipates, document, effectiveLines, validates])

  const preflight = useMemo<DocumentPreflight | null>(() => {
    if (document === undefined || policy === null) {
      return null
    }
    return evaluateDocumentPreflight({
      lines: effectiveLines,
      documentType: document.documentType,
      policy,
      capability: capabilityEvaluations,
      documentStatus: document.documentStatus,
    })
  }, [document, policy, effectiveLines, capabilityEvaluations])

  const decision = useCallback(
    (action: DocumentActionType): DocumentActionDecision =>
      evaluateActionDecision(policy, action, permissions.isActionPermitted),
    [policy, permissions.isActionPermitted],
  )

  const canSubmit = decision('Submit').presentation === 'Enabled'
  const canPost = decision('Post').presentation === 'Enabled'

  const { refetch: refetchDetail } = detailQuery
  const { refetch: refetchPolicy } = policyQuery
  const refetch = useCallback(async (): Promise<void> => {
    await Promise.all([refetchDetail(), refetchPolicy()])
  }, [refetchDetail, refetchPolicy])

  return {
    document,
    policy,
    isLoading: detailQuery.isPending || policyQuery.isPending,
    isError: detailQuery.isError || policyQuery.isError,
    preflight,
    decision,
    canSubmit,
    canPost,
    refetch,
  }
}
