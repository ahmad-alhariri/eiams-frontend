import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { DocumentScopeReadOnlyBanner } from './document-scope-read-only-banner'
import { createSessionScope } from '@/test/msw/factories'
import type { SessionResponse } from '@/modules/auth/types/session.types'

function sessionWithScopeType(scopeType: 'Enterprise' | 'Site' | 'Warehouse'): SessionResponse {
  return {
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'manager@example.com',
      firstName: 'مدير',
      lastName: 'العمليات',
      employeeId: null,
      employeeName: null,
    },
    role: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'WH_MGR',
      nameAr: 'مدير المستودع',
      description: null,
    },
    activeScope: createSessionScope({
      scopeType,
      scopeId: scopeType === 'Enterprise' ? null : '00000000-0000-0000-0000-000000000020',
      scopeName: scopeType === 'Enterprise' ? 'المنشأة' : 'الموقع',
    }),
    permissionCodes: ['document.view'],
  }
}

function renderWithSession(session: SessionResponse | undefined): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  if (session !== undefined) {
    client.setQueryData(authSessionQueryKey, session)
  }
  render(
    <QueryClientProvider client={client}>
      <DocumentScopeReadOnlyBanner />
    </QueryClientProvider>,
  )
}

describe('DocumentScopeReadOnlyBanner', () => {
  it('renders the Enterprise-scoped Arabic banner when the active scope is Enterprise', () => {
    renderWithSession(sessionWithScopeType('Enterprise'))
    expect(
      screen.getByText(
        'صلاحية القراءة فقط على مستوى المنشأة — لا يمكن تعديل عمليات هذا المستودع من نطاقك الحالي.',
      ),
    ).toBeTruthy()
  })

  it('renders the Site-scoped Arabic banner when the active scope is Site', () => {
    renderWithSession(sessionWithScopeType('Site'))
    expect(
      screen.getByText(
        'صلاحية القراءة فقط على مستوى الموقع — لا يمكن تعديل عمليات هذا المستودع من نطاقك الحالي.',
      ),
    ).toBeTruthy()
  })

  it('renders nothing when the active scope is Warehouse', () => {
    renderWithSession(sessionWithScopeType('Warehouse'))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders nothing when the session has not loaded yet', () => {
    renderWithSession(undefined)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
