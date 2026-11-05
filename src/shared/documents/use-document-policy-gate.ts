import { useCallback, useMemo } from 'react'

import {
  capabilityOperationForDocumentType,
  evaluateActionDecision,
  evaluateDocumentPreflight,
  toPreflightLineShapes,
  UNBOUND_CAPABILITY_VALIDATOR,
  type CapabilityValidatorBinding,
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
import type { DocumentActionType } from '@/shared/documents/types/document-action.types'
import type {
  DocumentPolicy,
  WarehouseDocumentDetails,
} from '@/shared/documents/types/document-wire.types'

const EMPTY_PREFLIGHT_LINES: readonly PreflightLineShape[] = []
const EMPTY_CAPABILITY_EVALUATIONS: readonly CapabilityEvaluation[] = []

export type { CapabilityValidationVerdict } from '@/shared/documents/document-policy-gates'
export type { CapabilityValidatorBinding } from '@/shared/documents/document-policy-gates'
export { UNBOUND_CAPABILITY_VALIDATOR } from '@/shared/documents/document-policy-gates'

export interface DocumentPolicyGateOptions {
  enabled?: boolean
  lines?: readonly PreflightLineShape[]
  /**
   * Factory binding the gate to the session's capability validator. The
   * factory is invoked once per render with the document's warehouseId, so a
   * caller that passes one must pass it on EVERY render (hooks contract);
   * production callers pass the module hook itself. When omitted (bare/test
   * mounts, the read-only detail page whose loaded lines never carry a
   * domain), the binding is unbound and every capability evaluation is
   * `unknown` — identical to a capability query that never runs.
   */
  capabilityValidation?: (warehouseId: string | undefined) => CapabilityValidatorBinding
}

export interface DocumentPolicyGateResult {
  document: WarehouseDocumentDetails | undefined
  policy: DocumentPolicy | null
  isLoading: boolean
  isError: boolean
  preflight: DocumentPreflight | null
  decision: (action: DocumentActionType) => DocumentActionDecision
  canSubmit: boolean
  canPost: boolean
  refetch: () => Promise<void>
}

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
  const warehouseIdForCapabilities = capabilityParticipates ? document?.warehouseId : undefined
  const capabilityValidator =
    options.capabilityValidation === undefined
      ? UNBOUND_CAPABILITY_VALIDATOR
      : options.capabilityValidation(warehouseIdForCapabilities)
  const { validates } = capabilityValidator

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
