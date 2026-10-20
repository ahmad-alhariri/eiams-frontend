import { useCallback, type ComponentPropsWithoutRef } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import type { WarehouseDocumentSummary } from '@/shared/documents/types/document-wire.types'
import { documentService } from '@/shared/documents/document-transport'
import { documentQueryKeys } from '@/shared/documents/use-document-queries'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'

/** How many posted-Issue candidates one search round-trip carries. */
const MAX_RESULTS = 20

// `originalIssueOptionLabel` is exported so the tests (and the page) reuse ONE
// label rule for the selected reference; co-locating it with the selector keeps
// the rule visible where the option payload is shaped.
/* eslint-disable react-refresh/only-export-components */

/** Human-readable reference of a posted Issue: the system reference plus the
 * paper pair when present (`paperDocumentNumber` is a SQL `Contains` filter,
 * so searching matches either form). A bare UUID is never rendered as a label.
 */
export function originalIssueOptionLabel(document: WarehouseDocumentSummary): string {
  const paper =
    document.paperDocumentNumber === null || document.paperDocumentNumber === ''
      ? null
      : `${document.paperDocumentNumber}${
          document.paperDocumentYear === null ? '' : `/${document.paperDocumentYear}`
        }`
  return paper === null
    ? document.systemReferenceNumber
    : `${document.systemReferenceNumber} (${paper})`
}

function toIssueOption(
  document: WarehouseDocumentSummary,
): AsyncSelectOption<WarehouseDocumentSummary> {
  return { value: document.id, label: originalIssueOptionLabel(document), payload: document }
}

/** AsyncSelect option payload for the currently selected issue. */
export type ReturnOriginalIssueOption = AsyncSelectOption<WarehouseDocumentSummary>

export interface ReturnOriginalIssueSelectorProps {
  /** The selected issue document id (null/'' = nothing selected yet). */
  value: string | null
  /**
   * The second argument's `payload` carries the full `WarehouseDocumentSummary`
   * — most importantly its `warehouseId`, which the page turns into the
   * client-side wrong-warehouse guard.
   */
  onValueChange: (value: string | null, option: ReturnOriginalIssueOption | undefined) => void
  disabled?: boolean
  /** Attributes forwarded to the inner combobox input (id, aria-*). */
  inputProps?: ComponentPropsWithoutRef<'input'>
}

/**
 * Server-authoritative posted-Issue selector for the Return petal (FIX-R3).
 * Options come from `GET /warehouse-documents?documentType=Issue&
 * documentStatus=Posted` — never free text — and the empty query lists the
 * most recent posted issues. The document's own warehouse is deliberately NOT
 * a filter: a wrong-warehouse issue must stay selectable so the client-side
 * mismatch guard (and the server's `WrongWarehouse`) can be exercised.
 */
export function ReturnOriginalIssueSelector({
  value,
  onValueChange,
  disabled = false,
  inputProps,
}: ReturnOriginalIssueSelectorProps) {
  const scope = useActiveScopeContext().activeScopeCacheKey
  const queryClient = useQueryClient()

  const loadOptions = useCallback(
    async (query: string) => {
      if (scope === undefined) {
        return []
      }
      const trimmed = query.trim()
      const filters = {
        documentType: 'Issue' as const,
        documentStatus: 'Posted' as const,
        page: 1,
        pageSize: MAX_RESULTS,
        ...(trimmed === '' ? {} : { paperDocumentNumber: trimmed }),
      }
      const page = await queryClient.fetchQuery({
        queryKey: documentQueryKeys.documents(scope, filters),
        queryFn: () => documentService.listDocuments(filters),
        staleTime: OPERATIONAL_STALE_TIME,
      })
      return page.items.map(toIssueOption)
    },
    [queryClient, scope],
  )

  return (
    <AsyncSelect<WarehouseDocumentSummary>
      value={value === null || value === '' ? null : value}
      onValueChange={onValueChange}
      loadOptions={loadOptions}
      // An empty query lists recent posted issues; typing searches the paper
      // number (server-side `Contains`).
      minQueryLength={0}
      maxResults={MAX_RESULTS}
      placeholder="ابحث برقم سند الصرف الورقي أو المرجع..."
      emptyMessage="لا توجد سندات صرف مُرصدة مطابقة."
      errorMessage="تعذر البحث عن سندات الصرف."
      disabled={disabled || scope === undefined}
      {...(inputProps === undefined ? {} : { inputProps })}
    />
  )
}
