import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOrganizationalUnit, createPage, fixtureUuid } from '@/test/msw/factories'
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
    const root = createOrganizationalUnit({ orgUnitId: fixtureUuid(1), nameAr: 'الإدارة العامة' })
    const child = createOrganizationalUnit({
      orgUnitId: fixtureUuid(2),
      parentOrgUnitId: root.orgUnitId,
      nameAr: 'مديرية الشؤون الإدارية',
    })
    let receivedPageIndex: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, ({ request }) => {
        const url = new URL(request.url)
        receivedPageIndex = url.searchParams.get('pageIndex')
        receivedPageSize = url.searchParams.get('pageSize')
        return HttpResponse.json(createPage([root, child]))
      }),
    )

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'الوحدات التنظيمية' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(root.nameAr)).toBeInTheDocument()
    expect(screen.getByText(child.nameAr)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'شجرة الوحدات التنظيمية' })).toBeInTheDocument()
    expect(receivedPageIndex).toBe('0')
    expect(receivedPageSize).toBe('200')
  })

  it('sends a debounced contract search query', async () => {
    const user = userEvent.setup()
    const receivedSearches: Array<string | null> = []

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, ({ request }) => {
        receivedSearches.push(new URL(request.url).searchParams.get('search'))
        return HttpResponse.json(createPage([createOrganizationalUnit()]))
      }),
    )

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper() })

    await screen.findByText('الإدارة')
    await user.type(screen.getByLabelText('البحث في الوحدات'), 'مالية')

    await waitFor(() => expect(receivedSearches).toContain('مالية'))
  })

  it('explains an empty result in Arabic', async () => {
    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, () => HttpResponse.json(createPage())),
    )

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { name: 'لا توجد وحدات تنظيمية' }),
    ).toBeInTheDocument()
  })

  it('retries a failed request through the Arabic error state', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/organizational-units`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([createOrganizationalUnit()]))
      }),
    )

    render(<OrganizationalUnitsPage />, { wrapper: createWrapper({ retry: false }) })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل الوحدات التنظيمية' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('الإدارة')).toBeInTheDocument()
  })
})
