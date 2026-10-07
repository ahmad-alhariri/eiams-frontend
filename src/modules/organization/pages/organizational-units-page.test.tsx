import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { okPageJson } from '@/test/msw/envelope'
import { createOrganizationalUnit, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import OrganizationalUnitsPage from './organizational-units-page'

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

describe('OrganizationalUnitsPage', () => {
  it('renders the contract-backed organizational hierarchy using the maximum permitted page size', async () => {
    const root = createOrganizationalUnit({ id: fixtureUuid(1), name: 'الإدارة العامة' })
    const child = createOrganizationalUnit({
      id: fixtureUuid(2),
      parentId: root.id,
      name: 'مديرية الشؤون الإدارية',
      unitType: 'Directorate',
    })
    let receivedPage: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, ({ request }) => {
        const url = new URL(request.url)
        receivedPage = url.searchParams.get('page')
        receivedPageSize = url.searchParams.get('pageSize')
        return okPageJson([root, child])
      }),
    )

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'الوحدات التنظيمية' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(root.name)).toBeInTheDocument()
    expect(screen.getByText(child.name)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'شجرة الوحدات التنظيمية' })).toBeInTheDocument()
    // The query key the backend binds is `page`, not the frozen snapshot's
    // `pageIndex` (which it silently discards).
    expect(receivedPage).toBe('0')
    expect(receivedPageSize).toBe('200')
  })

  it('nests a child under its parent using the wire id/parentId relation', async () => {
    const parent = createOrganizationalUnit({ id: fixtureUuid(11), name: 'الإدارة العليا' })
    const grandchild = createOrganizationalUnit({
      id: fixtureUuid(12),
      parentId: parent.id,
      name: 'قسم الموارد البشرية',
    })

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([parent, grandchild])),
    )

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper() })

    const tree = await screen.findByRole('list', { name: 'شجرة الوحدات التنظيمية' })
    // The grandchild must sit inside the parent's branch, not beside it. This
    // is the assertion that could never fail before: `parentOrgUnitId` was
    // `undefined` on every record, so the builder keyed its map on `undefined`
    // and flattened the hierarchy into a list of roots.
    const rootBranches = Array.from(tree.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    )
    expect(rootBranches).toHaveLength(1)
    expect(within(tree).getByRole('button', { name: `طي ${parent.name}` })).toBeInTheDocument()
    expect(within(rootBranches[0] as HTMLElement).getByText(grandchild.name)).toBeInTheDocument()
  })

  it('keeps a cyclic parent reference from hiding units or recursing forever', async () => {
    // A `parentId` cycle is representable on the wire — the server never sends
    // one, but the tree builder must neither hang nor drop records if it does.
    const first = createOrganizationalUnit({ id: fixtureUuid(21), name: 'الدائرة الأولى' })
    const second = createOrganizationalUnit({
      id: fixtureUuid(22),
      name: 'الدائرة الثانية',
      parentId: first.id,
    })
    const third = createOrganizationalUnit({
      id: fixtureUuid(23),
      name: 'دائرة الموارد',
      parentId: fixtureUuid(22),
    })
    // Close the loop: `first` now claims `second` as its parent.
    const loopedFirst = createOrganizationalUnit({
      id: first.id,
      name: first.name,
      parentId: second.id,
    })

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, () =>
        okPageJson([loopedFirst, second, third]),
      ),
    )

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper() })

    const tree = await screen.findByRole('list', { name: 'شجرة الوحدات التنظيمية' })
    for (const unit of [loopedFirst, second, third]) {
      expect(within(tree).getByText(unit.name)).toBeInTheDocument()
    }
  })

  it('sends a debounced contract search query', async () => {
    const user = userEvent.setup()
    const receivedSearches: Array<string | null> = []
    const unit = createOrganizationalUnit()

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, ({ request }) => {
        receivedSearches.push(new URL(request.url).searchParams.get('search'))
        return okPageJson([unit])
      }),
    )

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper() })

    await screen.findByText(unit.name)
    await user.type(screen.getByLabelText('البحث في الوحدات'), 'مالية')

    await waitFor(() => expect(receivedSearches).toContain('مالية'))
  })

  it('explains an empty result in Arabic', async () => {
    server.use(http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([])))

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { name: 'لا توجد وحدات تنظيمية' }),
    ).toBeInTheDocument()
  })

  it('retries a failed request through the Arabic error state', async () => {
    let attempts = 0
    const recovered = createOrganizationalUnit()

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okPageJson([recovered])
      }),
    )

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper({ retry: false }) })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل الوحدات التنظيمية' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText(recovered.name)).toBeInTheDocument()
  })
})
