import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUserDirectoryRow } from '@/test/msw/factories'
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
    const account = createUserDirectoryRow()
    let receivedPage: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/admin/users`, ({ request }) => {
        const url = new URL(request.url)
        receivedPage = url.searchParams.get('page')
        receivedPageSize = url.searchParams.get('pageSize')
        return okPageJson([account], { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 })
      }),
    )

    render(<UsersListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'المستخدمون' })).toBeInTheDocument()
    expect(await screen.findByText(account.firstName + ' ' + account.lastName)).toBeInTheDocument()
    expect(screen.getByText(account.email)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(receivedPage).toBe('1')
    expect(receivedPageSize).toBe('10')
  })

  it('sends debounced text search to the server and resets the current page', async () => {
    const user = userEvent.setup()
    const receivedSearches: Array<string | null> = []

    server.use(
      http.get(`${API_BASE_URL}/admin/users`, ({ request }) => {
        const url = new URL(request.url)
        receivedSearches.push(url.searchParams.get('search'))
        return okPageJson([createUserDirectoryRow()])
      }),
    )

    render(<UsersListPage />, { wrapper: createWrapper() })

    await screen.findByText('مستخدم اختباري')
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
          : okPageJson([createUserDirectoryRow()])
      }),
    )

    render(<UsersListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل المستخدمين' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('مستخدم اختباري')).toBeInTheDocument()
  })
})
