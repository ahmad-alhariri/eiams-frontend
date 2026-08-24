import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'

import IssueDocumentFormPage from './issue-document-form-page'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

function createWrapper() {
  const client = createQueryClient()
  return function PageWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('IssueDocumentFormPage', () => {
  it('renders the Arabic page title, spine header, recipient section, and line editor', async () => {
    render(<IssueDocumentFormPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'سند صرف جديد' })).toBeInTheDocument()
    expect(screen.getByLabelText('المستودع')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'الجهة المستلمة' })).toBeInTheDocument()
    expect(screen.getByLabelText('سبب الصرف')).toBeInTheDocument()
    expect(screen.getAllByLabelText('المادة').length).toBeGreaterThan(0)
  })

  it('keeps the save button enabled while no line is over its (unknown) balance', async () => {
    render(<IssueDocumentFormPage />, { wrapper: createWrapper() })

    // With an empty material selection there is nothing to over-draw, so the
    // submit stays enabled and no balance alert renders.
    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeEnabled())
    expect(document.querySelector('[role=alert][class*="text-destructive"]')).toBeNull()
  })
})
