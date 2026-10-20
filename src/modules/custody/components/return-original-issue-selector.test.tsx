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

  it('loads options from POSTED Issue documents server-side', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('documentType')).toBe('Issue')
        expect(url.searchParams.get('documentStatus')).toBe('Posted')
        const paperQuery = url.searchParams.get('paperDocumentNumber')
        const all = [MATCHED_ISSUE, WRONG_WAREHOUSE_ISSUE]
        return okPageJson(
          paperQuery === null || paperQuery === ''
            ? all
            : all.filter((row) => row.paperDocumentNumber?.includes(paperQuery)),
        )
      }),
    )
    const onValueChange = vi.fn(
      (value: string | null, option: ReturnOriginalIssueOption | undefined) => {
        void value
        void option
      },
    )
    const user = userEvent.setup()
    renderSelector({ value: null, onValueChange })

    const input = screen.getByRole('combobox')
    await user.type(input, 'ISSUE-2026-0001')
    const option = await screen.findByRole('option')
    // The label IS the human-readable reference — the uuid is the hidden value.
    expect(option.textContent).not.toContain(ISSUE_DOC_ID)
    expect(option.textContent).toContain('EIAMS-ISS-2026-0001')

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
