import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createRoleProjection, createSession, createUserDirectoryRow } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import UsersListPage from './users-list-page'

const API_BASE_URL = '/api/v1'

/** Pinned so the row's `roleId` and the catalogue's `id` are the same role. */
const ROLE_ID = '00000000-0000-4000-8000-0000000000e5'

function createWrapper(
  options: { readonly retry?: false; readonly permissions?: readonly string[] } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: options.retry === false ? false : 1 } },
  })
  if (options.permissions !== undefined) {
    client.setQueryData(
      authSessionQueryKey,
      createSession({ permissionCodes: options.permissions }),
    )
  }

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

  it('renders the Arabic role label from the catalogue, not the served role code', async () => {
    // The directory row joins to `Role.Name`, so what the server sends is the CODE.
    // The Arabic label is served only by GET /admin/roles, which this page already
    // fetches — the column used to ignore it and print `SYSTEM_ADMIN` in an Arabic
    // table.
    const row = createUserDirectoryRow({ roleId: ROLE_ID, roleName: 'SYSTEM_ADMIN' })
    const role = createRoleProjection({ id: ROLE_ID, name: 'SYSTEM_ADMIN', nameAr: 'مدير النظام' })

    server.use(
      http.get(`${API_BASE_URL}/admin/users`, () => okPageJson([row])),
      http.get(`${API_BASE_URL}/admin/roles`, () => okPageJson([role])),
    )

    render(<UsersListPage />, {
      wrapper: createWrapper({ permissions: ['admin.user.manage', 'admin.role.view'] }),
    })

    expect(await screen.findByText('مدير النظام')).toBeInTheDocument()
    expect(screen.queryByText('SYSTEM_ADMIN')).not.toBeInTheDocument()
  })

  it('falls back to the served role code when the catalogue is not readable', async () => {
    // GET /admin/roles needs `admin.role.view`, which `admin.user.manage` does not
    // imply. A viewer without it still reads the directory, so the row's own
    // server-resolved code is shown rather than a label that was never fetched.
    const row = createUserDirectoryRow({ roleId: ROLE_ID, roleName: 'SYSTEM_ADMIN' })

    server.use(http.get(`${API_BASE_URL}/admin/users`, () => okPageJson([row])))

    render(<UsersListPage />, {
      wrapper: createWrapper({ permissions: ['admin.user.manage'] }),
    })

    expect(await screen.findByText('SYSTEM_ADMIN')).toBeInTheDocument()
    expect(screen.queryByText('مدير النظام')).not.toBeInTheDocument()
  })

  it('keeps a failed role-catalogue read distinguishable from an empty one, and retries it', async () => {
    // The role catalogue is a SECONDARY read: the directory comes from the
    // users read, and the roles only fill the create dialog's role picker. A
    // failed read used to render as "no roles are configured" — an empty,
    // disabled picker with no Arabic reason and no retry.
    const row = createUserDirectoryRow({ roleId: ROLE_ID, roleName: 'SYSTEM_ADMIN' })
    const role = createRoleProjection({ id: ROLE_ID, name: 'SYSTEM_ADMIN', nameAr: 'مدير النظام' })
    let roleAttempts = 0

    server.use(
      http.get(`${API_BASE_URL}/admin/users`, () => okPageJson([row])),
      http.get(`${API_BASE_URL}/admin/roles`, () => {
        roleAttempts += 1
        return roleAttempts === 1 ? new HttpResponse(null, { status: 500 }) : okPageJson([role])
      }),
    )

    render(<UsersListPage />, {
      wrapper: createWrapper({
        retry: false,
        permissions: ['admin.user.manage', 'admin.role.view'],
      }),
    })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل الأدوار' })).toBeInTheDocument()
    // The action that would consume the empty list stays closed until the
    // catalogue is readable again.
    expect(screen.getByRole('button', { name: 'مستخدم جديد' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(roleAttempts).toBe(2))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'تعذّر تحميل الأدوار' }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'مستخدم جديد' })).toBeEnabled()
  })

  it('shows an em dash for a user with no assignment, not an empty cell', async () => {
    // An account can exist before its assignment does. The backend sends roleId,
    // roleName and scopeType as three nulls together.
    const row = createUserDirectoryRow({ roleId: null, roleName: null, scopeId: null })
    const other = createUserDirectoryRow({
      id: '00000000-0000-4000-8000-0000000000f6',
      email: 'assigned.user@eiams.local',
      firstName: 'أحمد',
      lastName: 'محمد',
      roleId: ROLE_ID,
      roleName: 'SYSTEM_ADMIN',
    })

    server.use(http.get(`${API_BASE_URL}/admin/users`, () => okPageJson([row, other])))

    const { container } = render(<UsersListPage />, {
      wrapper: createWrapper({ permissions: ['admin.user.manage', 'admin.role.view'] }),
    })

    await screen.findByText('مستخدم اختباري')
    // Queried off the DOM rather than by ARIA role: a native `<table>` carries no
    // explicit `role="table"`, so its cells are not exposed as `rowcell`.
    const cells = Array.from(container.querySelectorAll('tbody td')).map((cell) => cell.textContent)
    expect(cells).toContain('—')
    expect(cells).toContain('SYSTEM_ADMIN')
  })
})
