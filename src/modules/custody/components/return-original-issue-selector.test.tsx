import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { fixtureUuid, createNamedReference, createWarehouseDocument } from '@/test/msw/factories'
import { okPageJson } from '@/test/msw/envelope'
import { wireDocumentSummary } from '@/test/msw/document-wire-fixtures'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'
import {
  ReturnOriginalIssueSelector,
  originalIssueOptionLabel,
  type ReturnOriginalIssueOption,
} from './return-original-issue-selector'

const API_BASE_URL = '/api/v1'
const ISSUE_DOC_ID = fixtureUuid(155)
const WRONG_ISSUE_DOC_ID = fixtureUuid(156)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

const WAREHOUSE_ID = fixtureUuid(30)
const WRONG_WAREHOUSE_ID = fixtureUuid(31)

/** Posted Issue rows in the live wire list shape (`GET /warehouse-documents`). */
function postedIssue(documentId: string, warehouseId: string, sequence: number) {
  const padded = sequence.toString().padStart(4, '0')
  return wireDocumentSummary(
    createWarehouseDocument({
      documentId,
      documentType: 'Issue',
      documentStatus: 'Posted',
      warehouse: createNamedReference({ id: warehouseId, displayName: 'مستودع' }),
      systemReferenceNumber: `EIAMS-ISS-2026-${padded}`,
      paperDocumentNumber: `ISSUE-2026-${padded}`,
      paperDocumentYear: 2026,
    }),
  )
}

const MATCHED_ISSUE = postedIssue(ISSUE_DOC_ID, WAREHOUSE_ID, 1)
const WRONG_WAREHOUSE_ISSUE = postedIssue(WRONG_ISSUE_DOC_ID, WRONG_WAREHOUSE_ID, 2)

/**
 * The list route the way the backend binds it: `systemReferenceNumber` and
 * `paperDocumentNumber` are two INDEPENDENT `Contains` filters, ANDed. The
 * handler therefore answers only what the bound filters match — a picker that
 * searches the field the label does NOT lead with returns nothing, which is
 * the defect this suite guards. Returns the bound query of every request.
 */
function useWarehouseDocumentList() {
  const boundQueries: URLSearchParams[] = []
  server.use(
    http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
      const url = new URL(request.url)
      boundQueries.push(url.searchParams)
      const systemQuery = url.searchParams.get('systemReferenceNumber')
      const paperQuery = url.searchParams.get('paperDocumentNumber')
      const all = [MATCHED_ISSUE, WRONG_WAREHOUSE_ISSUE]
      return okPageJson(
        all.filter(
          (row) =>
            (systemQuery === null || (row.systemReferenceNumber ?? '').includes(systemQuery)) &&
            (paperQuery === null || (row.paperDocumentNumber ?? '').includes(paperQuery)),
        ),
      )
    }),
  )
  return boundQueries
}

function renderSelector(props: {
  value: string | null
  onValueChange: (value: string | null, option: ReturnOriginalIssueOption | undefined) => void
}) {
  const client = createQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <ReturnOriginalIssueSelector {...props} inputProps={{ id: 'original-issue-document' }} />
    </QueryClientProvider>,
  )
}

describe('ReturnOriginalIssueSelector (FIX-R3)', () => {
  it('labels a document with the system reference and paper pair, never a bare uuid', () => {
    expect(originalIssueOptionLabel(MATCHED_ISSUE)).toBe(
      'EIAMS-ISS-2026-0001 (ISSUE-2026-0001/2026)',
    )
    // Falls back to the system reference when the paper pair is absent.
    expect(originalIssueOptionLabel({ ...MATCHED_ISSUE, paperDocumentNumber: null })).toBe(
      'EIAMS-ISS-2026-0001',
    )
  })

  it('searches by the identifier the label leads with, so a copied reference finds the row', async () => {
    const boundQueries = useWarehouseDocumentList()
    const user = userEvent.setup()
    renderSelector({ value: null, onValueChange: vi.fn() })

    // The identifier the option label shows FIRST is the one a user copies.
    const leadIdentifier = MATCHED_ISSUE.systemReferenceNumber
    expect(originalIssueOptionLabel(MATCHED_ISSUE).startsWith(leadIdentifier)).toBe(true)

    await user.type(screen.getByRole('combobox'), leadIdentifier)

    const option = await screen.findByRole('option')
    // The visible label carries the identifier the search matched.
    expect(option.textContent).toContain(leadIdentifier)
    // ... and the request bound the parameter that matches it (and only it).
    const bound = boundQueries[boundQueries.length - 1]
    expect(bound?.get('systemReferenceNumber')).toBe(leadIdentifier)
    expect(bound?.get('paperDocumentNumber')).toBeNull()
  })

  it('loads options from POSTED Issue documents server-side', async () => {
    const boundQueries = useWarehouseDocumentList()
    const onValueChange = vi.fn(
      (value: string | null, option: ReturnOriginalIssueOption | undefined) => {
        void value
        void option
      },
    )
    const user = userEvent.setup()
    renderSelector({ value: null, onValueChange })

    await user.type(screen.getByRole('combobox'), MATCHED_ISSUE.systemReferenceNumber)
    const option = await screen.findByRole('option')
    // The label IS the human-readable reference — the uuid is the hidden value.
    expect(option.textContent).not.toContain(ISSUE_DOC_ID)
    expect(option.textContent).toContain('EIAMS-ISS-2026-0001')

    const bound = boundQueries[boundQueries.length - 1]
    expect(bound?.get('documentType')).toBe('Issue')
    expect(bound?.get('documentStatus')).toBe('Posted')

    await user.click(option)
    expect(onValueChange).toHaveBeenCalledWith(ISSUE_DOC_ID, expect.anything())
    const optionArg = onValueChange.mock.calls[0]?.[1]
    const payload = optionArg?.payload
    expect(payload?.id).toBe(ISSUE_DOC_ID)
    // The full summary travels in the payload so the page can run the
    // wrong-warehouse guard on its warehouseId.
    expect(payload?.warehouseId).toBe(WAREHOUSE_ID)
  })
})
