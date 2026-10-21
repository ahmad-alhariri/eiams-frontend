import { QueryClientProvider } from '@tanstack/react-query'
import { userEvent } from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { errJson } from '@/test/msw/envelope'
import { createWarehouseDocument } from '@/test/msw/factories'
import { wireDocumentDetails } from '@/test/msw/document-wire-fixtures'
import { createPaperReferenceHandler } from '@/test/msw/warehouse-document-handlers'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

import { DraftPaperReferenceEditor } from './draft-paper-reference-editor'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000002bc'

function renderEditor(
  fixture: ReturnType<typeof createWarehouseDocument>,
  onConflict: () => void = () => undefined,
) {
  const client = createQueryClient()
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return render(
    <DraftPaperReferenceEditor
      documentId={DOCUMENT_ID}
      document={wireDocumentDetails(fixture)}
      onConflict={onConflict}
    />,
    { wrapper: Wrapper },
  )
}

describe('DraftPaperReferenceEditor', () => {
  it('renders nothing outside the Draft mutable window', () => {
    const { container } = renderEditor(
      createWarehouseDocument({ documentId: DOCUMENT_ID, documentStatus: 'Posted' }),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('saves a paper reference of an existing Draft with the current rowVersion', async () => {
    const fixture = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentType: 'Return',
      documentStatus: 'Draft',
      rowVersion: 1,
    })
    const updated: { paperDocumentNumber: string; rowVersion: number } = {
      paperDocumentNumber: fixture.paperDocumentNumber ?? '',
      rowVersion: fixture.rowVersion,
    }
    server.use(
      ...createPaperReferenceHandler({
        initialDocument: fixture,
        onDocumentUpdated: (document) => {
          updated.paperDocumentNumber = document.paperDocumentNumber
          updated.rowVersion = document.rowVersion
        },
      }),
    )

    renderEditor(fixture)

    // The editor pre-fills from the persisted reference so an operator sees
    // and corrects the server-known value; a server-created reversal draft is
    // the degenerate case whose difference is only the wire value.
    expect(screen.getByLabelText('رقم المستند الورقي')).toHaveValue('2024/123')
    expect(screen.getByLabelText('السنة الورقية')).toHaveValue('2024')

    await userEvent.clear(screen.getByLabelText('رقم المستند الورقي'))
    await userEvent.type(screen.getByLabelText('رقم المستند الورقي'), '2026/0007')
    await userEvent.type(screen.getByLabelText('السنة الورقية'), '2026')
    await userEvent.click(screen.getByRole('button', { name: 'حفظ الرقم الورقي' }))

    await waitFor(() => {
      expect(updated.paperDocumentNumber).toBe('2026/0007')
    })
    expect(updated.rowVersion).toBe(2)
  })

  it('surfaces the conflict-recovery entry point when the rowVersion is stale', async () => {
    const fixture = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Draft',
      rowVersion: 1,
    })
    const onConflict = vi.fn()
    server.use(
      // The server has already moved to rowVersion 3; the editor sends the
      // stale 1 it still shows, so the write answers 409.
      ...createPaperReferenceHandler({
        initialDocument: { ...fixture, rowVersion: 3 },
      }),
    )

    renderEditor(fixture, onConflict)

    await userEvent.click(screen.getByRole('button', { name: 'حفظ الرقم الورقي' }))

    await waitFor(() => {
      expect(onConflict).toHaveBeenCalledOnce()
    })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('تغيرت البيانات')
  })

  it('does not open the conflict dialog for a business 409 and reports its own copy', async () => {
    const fixture = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Draft',
      rowVersion: 1,
    })
    const onConflict = vi.fn()
    // A state conflict, not a stale row: the save is refused on its own merits,
    // so a "someone else edited this document" reload dialog would be a lie.
    server.use(
      http.put(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/paper-reference`, () =>
        errJson(409, {
          code: 'WAREHOUSE_DOCUMENTS_PAPER_REFERENCE_REQUIRED',
          message: 'The paper reference is required.',
        }),
      ),
    )

    renderEditor(fixture, onConflict)

    await userEvent.click(screen.getByRole('button', { name: 'حفظ الرقم الورقي' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'يجب إدخال رقم المستند الورقي وسنته قبل التقديم.',
      ),
    )
    expect(onConflict).not.toHaveBeenCalled()
  })

  it('blocks the save with Arabic validation messages and no request', async () => {
    const fixture = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Draft',
    })
    const updated = vi.fn()
    server.use(
      ...createPaperReferenceHandler({ initialDocument: fixture, onDocumentUpdated: updated }),
    )

    renderEditor(fixture)

    await userEvent.clear(screen.getByLabelText('رقم المستند الورقي'))
    await userEvent.click(screen.getByRole('button', { name: 'حفظ الرقم الورقي' }))

    expect(await screen.findByText('رقم المستند الورقي مطلوب.')).toBeInTheDocument()
    expect(updated).not.toHaveBeenCalled()
  })
})
