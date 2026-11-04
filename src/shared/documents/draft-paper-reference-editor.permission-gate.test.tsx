import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it } from 'vitest'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import {
  createSessionRole,
  createSessionScope,
  createSessionUser,
  createWarehouseDocument,
} from '@/test/msw/factories'
import { wireDocumentDetails } from '@/test/msw/document-wire-fixtures'
import { createQueryClient } from '@/shared/services/query.client'

import { DraftPaperReferenceEditor } from './draft-paper-reference-editor'

function sessionWith(permissionCodes: readonly string[]) {
  return {
    user: createSessionUser({ firstName: 'أمين' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

function renderWithPermissions(
  fixture: ReturnType<typeof createWarehouseDocument>,
  codes: readonly string[],
) {
  const client = createQueryClient()
  client.setQueryData(authSessionQueryKey, sessionWith(codes))
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return render(
    <DraftPaperReferenceEditor
      documentId="00000000-0000-4000-8000-0000000002bc"
      document={wireDocumentDetails(fixture)}
      onConflict={() => undefined}
    />,
    { wrapper: Wrapper },
  )
}

describe('DraftPaperReferenceEditor permission gate (EIAMS-FE-F01)', () => {
  it('renders nothing for a Draft when the session lacks document.update (view-only)', () => {
    const fixture = createWarehouseDocument({
      documentId: '00000000-0000-4000-8000-0000000002bc',
      documentStatus: 'Draft',
      documentType: 'Receiving',
    })
    const { container } = renderWithPermissions(fixture, ['document.view'])
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the save control for a Draft when the session has document.view + document.update', () => {
    const fixture = createWarehouseDocument({
      documentId: '00000000-0000-4000-8000-0000000002bc',
      documentStatus: 'Draft',
      documentType: 'Receiving',
    })
    renderWithPermissions(fixture, ['document.view', 'document.update'])
    expect(screen.getByLabelText('رقم المستند الورقي')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ الرقم الورقي' })).toBeInTheDocument()
  })
})
