import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import {
  documentService,
  type ListWarehouseDocumentsQuery,
} from '@/shared/documents/document-transport'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const DOCUMENT_RESOURCE = 'document'
const EMPTY_FILTERS = {} as const

/** Contract-derived, stable list filters for the shared document query model. */
export type DocumentListFilters = ListWarehouseDocumentsQuery

type DocumentQueryOptions = {
  enabled?: boolean
}

export const documentQueryKeys = {
  documents: (scope: ScopeCacheKey, filters: DocumentListFilters) =>
    queryKeys.scoped(scope, DOCUMENT_RESOURCE, 'documents', filters),
  document: (scope: ScopeCacheKey, documentId: string) =>
    queryKeys.scoped(scope, DOCUMENT_RESOURCE, 'documents', documentId),
  history: (scope: ScopeCacheKey, documentId: string) =>
    queryKeys.scoped(scope, DOCUMENT_RESOURCE, 'documents', documentId, 'history'),
  policy: (scope: ScopeCacheKey, documentId: string) =>
    queryKeys.scoped(scope, DOCUMENT_RESOURCE, 'documents', documentId, 'policy'),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

/**
 * Invalidates the scoped document-detail branch (detail/history/policy of one
 * document) after a mutation. The scoped key factory guarantees the
 * invalidation only touches this scope. Shared by attachment and lifecycle
 * mutation hooks.
 */
export function useInvalidateDocumentDetail() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return useCallback(
    async (documentId: string) => {
      if (activeScopeCacheKey === undefined) return

      await queryClient.invalidateQueries({
        queryKey: documentQueryKeys.document(activeScopeCacheKey, documentId),
        exact: false,
      })
    },
    [queryClient, activeScopeCacheKey],
  )
}

export function useDocumentListQuery(
  filters: DocumentListFilters = EMPTY_FILTERS,
  options: DocumentQueryOptions = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    ...options,
    queryKey:
      scope === undefined
        ? queryKeys.public(DOCUMENT_RESOURCE, 'documents', filters)
        : documentQueryKeys.documents(scope, filters),
    queryFn: () => documentService.listDocuments(filters),
    enabled: scope !== undefined && (options.enabled ?? true),
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useDocumentDetailQuery(
  documentId: string | null,
  options: DocumentQueryOptions = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    ...options,
    queryKey:
      scope === undefined || documentId === null
        ? queryKeys.public(DOCUMENT_RESOURCE, 'documents', documentId)
        : documentQueryKeys.document(scope, documentId),
    queryFn: () => documentService.getDocument(documentId ?? ''),
    enabled: scope !== undefined && documentId !== null && (options.enabled ?? true),
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useDocumentHistoryQuery(
  documentId: string | null,
  options: DocumentQueryOptions = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    ...options,
    queryKey:
      scope === undefined || documentId === null
        ? queryKeys.public(DOCUMENT_RESOURCE, 'documents', documentId, 'history')
        : documentQueryKeys.history(scope, documentId),
    queryFn: () => documentService.getDocumentHistory(documentId ?? ''),
    enabled: scope !== undefined && documentId !== null && (options.enabled ?? true),
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useDocumentPolicyQuery(
  documentId: string | null,
  options: DocumentQueryOptions = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    ...options,
    queryKey:
      scope === undefined || documentId === null
        ? queryKeys.public(DOCUMENT_RESOURCE, 'documents', documentId, 'policy')
        : documentQueryKeys.policy(scope, documentId),
    queryFn: () => documentService.getDocumentPolicy(documentId ?? ''),
    enabled: scope !== undefined && documentId !== null && (options.enabled ?? true),
    staleTime: OPERATIONAL_STALE_TIME,
  })
}
