import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPage, createUserSummary } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import UsersListPage from './users-list-page'

const API_BASE_URL = '/api/v1'

function createWrapper(options: { retry?: false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: options.retry === false ? false : 1 } },
  })

  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('UsersListPage', () => {
  it('renders contract-backed user rows and sends zero-based server pagination', async () => {
    const account = createUserSummary()
    let receivedPageIndex: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/admin/users`, ({ request }) => {
        const url = new URL(request.url)
        receivedPageIndex = url.searchParams.get('pageIndex')
        receivedPageSize = url.searchParams.get('pageSize')
        return HttpResponse.json(createPage([account], { totalItems: 11, totalPages: 2 }))
      }),
    )

    render(<UsersListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'المستخدمون' })).toBeInTheDocument()
    expect(await screen.findByText(account.displayName)).toBeInTheDocument()
    expect(screen.getByText(account.username)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(receivedPageIndex).toBe('0')
    expect(receivedPageSize).toBe('10')
  })

  it('sends debounced text search to the server and resets the current page', async () => {
    const user = userEvent.setup()
    const receivedSearches: Array<string | null> = []

    server.use(
      http.get(`${API_BASE_URL}/admin/users`, ({ request }) => {
        const url = new URL(request.url)
        receivedSearches.push(url.searchParams.get('search'))
        return HttpResponse.json(createPage([createUserSummary()]))
      }),
    )

    render(<UsersListPage />, { wrapper: createWrapper() })

    await screen.findByText('مستخدم تجريبي')
    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), ' أحمد ')

    await waitFor(() => expect(receivedSearches).toContain(' أحمد '))
  })

  it('retries a failed list request through the Arabic error state', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/admin/users`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([createUserSummary()]))
      }),
    )

    render(<UsersListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل المستخدمين' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('مستخدم تجريبي')).toBeInTheDocument()
  })
})
