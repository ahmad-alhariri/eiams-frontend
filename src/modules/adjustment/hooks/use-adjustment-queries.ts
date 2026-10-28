import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { ASSET_RESOURCE } from '@/modules/asset/hooks/use-asset-queries'
import { AUDIT_RESOURCE } from '@/modules/audit/hooks/use-audit-queries'
import { CUSTODY_RESOURCE } from '@/modules/custody/hooks/use-custody-queries'
import { RETURN_RESOURCE } from '@/modules/custody/hooks/use-return-eligible-items'
import { INVENTORY_RESOURCE } from '@/modules/inventory/hooks/use-inventory-queries'
import { COUNT_RESOURCE } from '@/modules/inventory-count/hooks/use-count-queries'
import { REPORTS_RESOURCE } from '@/modules/reports/hooks/use-reports-queries'
import type {
  AdjustmentDraftRequest,
  AdjustmentUpdateRequest,
  DisposalDraftRequest,
  ListAdjustmentsQuery,
  ListDisposalEligibleAssetsQuery,
} from '@/modules/adjustment/types/adjustment.types'
import { adjustmentService } from '@/modules/adjustment/services/adjustment.service'
import { documentService } from '@/shared/documents/document-transport'
import type { PaperReferenceInput } from '@/shared/documents/use-document-draft-mutations'
import { DOCUMENT_RESOURCE } from '@/shared/documents/use-document-queries'
import { reportApiError } from '@/shared/services/api-error'
import { toast } from '@/shared/ui/toast-manager'
import { createIdempotencyKey, type IdempotencyKey } from '@/shared/services/mutation-safety'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const ADJUSTMENT_RESOURCE = 'adjustments'

export const adjustmentQueryKeys = {
  adjustments: (scope: ScopeCacheKey, query: ListAdjustmentsQuery) =>
    queryKeys.scoped(scope, ADJUSTMENT_RESOURCE, 'adjustments', query),
  adjustment: (scope: ScopeCacheKey, adjustmentId: string) =>
    queryKeys.scoped(scope, ADJUSTMENT_RESOURCE, 'adjustment', adjustmentId),
  disposalEligibleAssets: (scope: ScopeCacheKey, query: ListDisposalEligibleAssetsQuery) =>
    queryKeys.scoped(scope, ADJUSTMENT_RESOURCE, 'disposal-eligible-assets', query),
}

const EMPTY_DISPOSAL_QUERY: ListDisposalEligibleAssetsQuery = {}

/** Input for {@link useReverseAdjustmentMutation}. */
export interface ReverseAdjustmentInput {
  reason: string
  rowVersion: number
}

/**
 * The ONE invalidation policy for the adjustment domain, shared by the reads
 * hook and `usePostAdjustmentAction`/`useReverseAdjustmentAction`. A posted or
 * reversed adjustment moves stock and (for disposal) closes custody, so every
 * read model derived from those ledgers is invalidated alongside the
 * adjustment list/detail keys. An adjustment IS a warehouse document: its own
 * document detail, policy and attachment reads change when it is posted, so the
 * document resource is invalidated too. Every scoped cache lives under
 * `[scoped, ...scopeParts, <resource>, ...]`.
 */
export function useAdjustmentInvalidation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeContext()
  return () => {
    if (scope.activeScopeCacheKey === undefined) return
    // One entry per resource a posted/reversed adjustment demonstrably changes:
    // - adjustments: list/detail status and lifecycle fields.
    // - inventory: balances and the stock-movement ledger it writes.
    // - asset: registry/status projections (disposal disposes assets).
    // - custody: disposal closes Active custody rows.
    // - document: its own detail, policy and attachment reads change on post.
    // - inventory-counts: the count's settlement projection is `Settled` iff
    //   its linked adjustment is Posted, and the count page renders from it.
    // - return: eligible-items lists filter `Custodies.Status == Active`,
    //   which a disposal post closes.
    // - reports: every report projection (count-adjustment, inventory,
    //   assets, documents, dashboard) derives from the same ledgers.
    // - audit: posting/reversing appends audit entries.
    // Deliberately excluded: catalog, organization, admin, warehouse,
    // receiving, issue and transfer — an adjustment post cannot change them.
    const resources = [
      ADJUSTMENT_RESOURCE,
      INVENTORY_RESOURCE,
      ASSET_RESOURCE,
      CUSTODY_RESOURCE,
      DOCUMENT_RESOURCE,
      COUNT_RESOURCE,
      RETURN_RESOURCE,
      REPORTS_RESOURCE,
      AUDIT_RESOURCE,
    ] as const
    for (const resource of resources) {
      // Built by the shared factory rather than by hand. A hand-derived prefix
      // can silently diverge from `queryKeys.scoped`'s shape and then match
      // nothing at all, which is the failure filed as eiams-frontend-jkel
      // (eiams-frontend-xlfs).
      void queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(scope.activeScopeCacheKey, resource),
      })
    }
  }
}

/**
 * Paged adjustments for the active scope (e21-t02). Operational data — 30s
 * stale time per the architecture's stale-time policy.
 */
export function useAdjustmentsListQuery(query: ListAdjustmentsQuery) {
  const scope = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope.activeScopeCacheKey === undefined
        ? ['adjustments', 'unscoped', query]
        : adjustmentQueryKeys.adjustments(scope.activeScopeCacheKey, query),
    queryFn: () => adjustmentService.listAdjustments(query),
    enabled: scope.activeScopeCacheKey !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** Single adjustment with its manager-owned lifecycle state and policy. */
export function useAdjustmentDetailQuery(adjustmentId: string | undefined | null) {
  const { activeScopeCacheKey: scope } = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope === undefined || adjustmentId == null
        ? ['adjustments', 'adjustment', 'unscoped', adjustmentId]
        : adjustmentQueryKeys.adjustment(scope, adjustmentId),
    queryFn: () => adjustmentService.getAdjustment(adjustmentId ?? ''),
    enabled: scope !== undefined && adjustmentId != null && adjustmentId !== '',
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/**
 * Authoritative disposal-eligible asset lookup (D-ADJ-01): disposal selection
 * must come from this server-provided list; free-text asset identities are
 * never permitted.
 */
export function useDisposalEligibleAssetsQuery(
  query: ListDisposalEligibleAssetsQuery = EMPTY_DISPOSAL_QUERY,
) {
  const { activeScopeCacheKey: scope } = useActiveScopeContext()
  return useQuery({
    queryKey:
      scope === undefined
        ? ['adjustments', 'disposal-eligible-assets', 'unscoped', query]
        : adjustmentQueryKeys.disposalEligibleAssets(scope, query),
    queryFn: () => adjustmentService.listDisposalEligibleAssets(query),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

/** Creates a Draft adjustment (manager-only per D-ADJ-01). */
export function useCreateAdjustmentMutation() {
  const invalidate = useAdjustmentInvalidation()
  return useMutation({
    mutationFn: (request: AdjustmentDraftRequest) => adjustmentService.createAdjustment(request),
    onSuccess: () => {
      invalidate()
      toast.success({ title: 'تم حفظ مسودة سند التسوية' })
    },
    onError: (error) => {
      reportApiError(error)
    },
  })
}

/**
 * The two writes of a disposal save: the LIVE disposal body, and the paper
 * reference the shared document engine owns.
 *
 * The paper reference is NOT part of the disposal body — the live endpoint
 * binds no such field — so it is written through the shared
 * `PUT /warehouse-documents/{id}/paper-reference` route, exactly like every
 * other document form.
 */
export interface CreateDisposalInput {
  readonly request: DisposalDraftRequest
  readonly paperReference: PaperReferenceInput
}

/**
 * The disposal DRAFT exists, but its paper reference was not stored: the
 * disposal is real, its audit trail is not.
 *
 * The form cannot simply be retried — the server refuses a second draft for an
 * asset that already has a pending one — and no page of the adjustment module
 * edits a draft's paper reference, so the copy states the fact and points at
 * the only remaining way out. The page therefore says exactly that instead of
 * a generic failure that hides a draft the user cannot see.
 */
export class DisposalPaperReferenceError extends Error {
  constructor(cause: unknown) {
    super('أُنشئت مسودة الإعدام لكن تعذّر حفظ رقم المستند الورقي؛ تواصل مع الدعم الفني لإتمامه.', {
      cause,
    })
    this.name = 'DisposalPaperReferenceError'
  }
}

/**
 * Creates the disposal DRAFT through the LIVE disposal endpoint
 * (`POST /adjustments/disposals`) and writes its paper reference through the
 * shared document engine's own route.
 *
 * A disposal is NOT a generic adjustment draft: it has its own endpoint, its
 * own body (`{ warehouseId, assetIds, reason }`) and its own server-derived
 * effect. Posting one still needs the shared document engine's SignedOriginal
 * gate, so this mutation only creates the draft.
 *
 * Two writes, not one, because the backend has two routes. The paper
 * reference is written right after the draft, guarded on the document's
 * CURRENT `rowVersion`: the disposal create answers only `{ id }`, so the
 * version the write must carry comes from a server read, never from the
 * browser. A failure in that write REJECTS this mutation, so the page reports
 * one Arabic error and never claims a disposal whose paper reference was
 * never stored.
 */
export function useCreateDisposalMutation() {
  const invalidate = useAdjustmentInvalidation()
  return useMutation({
    mutationFn: async ({ request, paperReference }: CreateDisposalInput) => {
      const created = await adjustmentService.createDisposalDraft(request)
      try {
        const document = await documentService.getDocument(created.id)
        await documentService.updatePaperReference(created.id, {
          expectedRowVersion: document.rowVersion,
          paperDocumentNumber: paperReference.paperDocumentNumber,
          paperDocumentYear: paperReference.paperDocumentYear,
        })
      } catch (error) {
        throw new DisposalPaperReferenceError(error)
      }
      return created.id
    },
    onSuccess: () => {
      invalidate()
      toast.success({ title: 'تم حفظ مسودة سند الإعدام' })
    },
    onError: (error) => {
      if (error instanceof DisposalPaperReferenceError) {
        reportApiError(error)
        return
      }
      reportApiError(error)
    },
  })
}

/** Updates a mutable Draft adjustment. */
export function useUpdateAdjustmentMutation(adjustmentId: string) {
  const invalidate = useAdjustmentInvalidation()
  return useMutation({
    mutationFn: (request: AdjustmentUpdateRequest) =>
      adjustmentService.updateAdjustment(adjustmentId, request),
    onSuccess: invalidate,
  })
}

/**
 * Posts the Draft (`post`, idempotent). Server owns the SignedOriginal gate.
 *
 * The idempotency key is minted once per user-approved execution and held in a
 * ref, so an explicit retry after an uncertain outcome reuses the SAME key the
 * server already saw. Minting it as a call argument made every invocation a new
 * key, which is exactly the case replay protection exists for: after a lost
 * response the user clicks again, and a fresh key lets the server treat it as a
 * second, separate post (eiams-frontend-xlfs; same contract as
 * `usePostAdjustmentAction` in `use-adjustment-actions.ts`).
 */
export function usePostAdjustmentMutation(adjustmentId: string) {
  const invalidate = useAdjustmentInvalidation()
  const idempotencyKeyRef = useRef<IdempotencyKey | null>(null)
  return useMutation({
    mutationFn: (rowVersion: number) => {
      idempotencyKeyRef.current ??= createIdempotencyKey()
      return adjustmentService.postAdjustment(adjustmentId, rowVersion, idempotencyKeyRef.current)
    },
    onSuccess: () => {
      idempotencyKeyRef.current = null
      invalidate()
    },
  })
}

/**
 * Reverses a Posted ordinary adjustment through a compensating document.
 *
 * Retry-safe idempotency key, as in `usePostAdjustmentMutation` above.
 */
export function useReverseAdjustmentMutation(adjustmentId: string) {
  const invalidate = useAdjustmentInvalidation()
  const idempotencyKeyRef = useRef<IdempotencyKey | null>(null)
  return useMutation({
    mutationFn: ({ reason, rowVersion }: ReverseAdjustmentInput) => {
      idempotencyKeyRef.current ??= createIdempotencyKey()
      return adjustmentService.reverseAdjustment(
        adjustmentId,
        rowVersion,
        reason,
        idempotencyKeyRef.current,
      )
    },
    onSuccess: () => {
      idempotencyKeyRef.current = null
      invalidate()
    },
  })
}
