import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import type { MaterialDomain } from '@/modules/catalog/types/catalog.types'
import { fixtureUuid } from '@/test/msw/factories'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'catalog.manage' && permissions.canManage,
  }),
}))

import MaterialDomainsPage from './material-domains-page'

const API_BASE_URL = '/api/v1'
const DOMAIN_ID = fixtureUuid(20)

/**
 * Wire-shaped fixture, minted locally. `catalog-wire-fixtures.ts` still mints
 * the frozen snapshot's record (`materialDomainId`, `nameAr`, `rowVersion`) and
 * no longer typechecks against `catalog.api-types`; the real projection is
 * `{ id, name, code, status }`.
 */
function makeDomain(overrides: Partial<MaterialDomain> = {}): MaterialDomain {
  return {
    id: DOMAIN_ID,
    name: 'تقنية المعلومات',
    code: 'IT',
    status: 'Active',
    ...overrides,
  }
}

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
  permissions.canManage = false
})

describe('MaterialDomainsPage', () => {
  it('requests the first one-based page on load and never sends page=0', async () => {
    const received: Array<{ page: string | null; pageSize: string | null }> = []
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, ({ request }) => {
        const params = new URL(request.url).searchParams
        received.push({ page: params.get('page'), pageSize: params.get('pageSize') })
        return okPageJson([makeDomain()])
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper() })
    await screen.findByText('تقنية المعلومات')

    // The wire is ONE-based and the controls are one-based, so the page crosses
    // unchanged: `page=0` is a 400 REQUEST_VALIDATION_FAILED on the backend.
    expect(received[0]).toEqual({ page: '1', pageSize: '10' })
    expect(received.every((query) => query.page === '1')).toBe(true)
  })

  it('reaches rows past the server default page size through the pager', async () => {
    const receivedPages: Array<string | null> = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, ({ request }) => {
        const params = new URL(request.url).searchParams
        receivedPages.push(params.get('page'))
        const page = Number(params.get('page') ?? '1')
        // 22 domains over a 10-row page is three pages — the live API reports
        // total_items: 22, total_pages: 3, has_next_page: true at this size.
        const names =
          page >= 3
            ? ['معدات تقنية المعلومات والاتصالات', 'معدات المكاتب الإدارية']
            : Array.from({ length: 10 }, (_, index) => `مجال ${page}-${index + 1}`)

        return okPageJson(
          names.map((name, index) => makeDomain({ id: fixtureUuid(40 + page * 10 + index), name })),
          { page, pageSize: 10, totalCount: 22, totalPages: 3 },
        )
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper() })

    const pager = await screen.findByRole('navigation', { name: 'تنقل بين الصفحات' })
    // The bar renders before the page resolves, so the totals are awaited.
    expect(await within(pager).findByText('صفحة ١ من ٣')).toBeInTheDocument()
    expect(within(pager).getByText('عرض ١–١٠ من ٢٢')).toBeInTheDocument()

    await user.click(within(pager).getByRole('button', { name: 'الصفحة التالية' }))

    await waitFor(() => expect(receivedPages).toContain('2'))
    expect(await screen.findByText('مجال 2-1')).toBeInTheDocument()
    expect(within(pager).getByText('عرض ١١–٢٠ من ٢٢')).toBeInTheDocument()
  })

  it('returns to the first page when the status filter changes', async () => {
    const receivedPages: Array<string | null> = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, ({ request }) => {
        const params = new URL(request.url).searchParams
        receivedPages.push(params.get('page'))
        const page = Number(params.get('page') ?? '1')
        const items =
          page >= 3
            ? [makeDomain({ id: fixtureUuid(61), name: 'معدات المكاتب الإدارية' })]
            : Array.from({ length: 10 }, (_, index) =>
                makeDomain({
                  id: fixtureUuid(40 + page * 10 + index),
                  name: `مجال ${page}-${index + 1}`,
                }),
              )

        return okPageJson(items, { page, pageSize: 10, totalCount: 22, totalPages: 3 })
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper() })
    const pager = await screen.findByRole('navigation', { name: 'تنقل بين الصفحات' })
    expect(await within(pager).findByText('صفحة ١ من ٣')).toBeInTheDocument()
    await user.click(within(pager).getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(receivedPages).toContain('2'))

    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة المجال' }))
    await user.click(await screen.findByRole('option', { name: 'نشط' }))

    // A new filter is a new result set; staying on page 3 of it would show an
    // empty table with no obvious cause.
    await waitFor(() => expect(receivedPages.at(-1)).toBe('1'))
    expect(within(pager).getByText('صفحة ١ من ٣')).toBeInTheDocument()
  })

  it('renders the scoped contract list and hides write actions without catalog.manage', async () => {
    const domain = makeDomain()
    let receivedStatus: string | null = null
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, ({ request }) => {
        receivedStatus = new URL(request.url).searchParams.get('status')
        return okPageJson([domain])
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'مجالات التصنيف' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(domain.name)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة مجال' })).not.toBeInTheDocument()
    expect(receivedStatus).toBeNull()
  })

  it('filters by status through the supported list query parameter', async () => {
    const receivedStatuses: Array<string | null> = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, ({ request }) => {
        receivedStatuses.push(new URL(request.url).searchParams.get('status'))
        return okPageJson([makeDomain({ status: 'Inactive' })])
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper() })
    await screen.findByText('تقنية المعلومات')
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة المجال' }))
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    await waitFor(() => expect(receivedStatuses).toContain('Inactive'))
  })

  it('retries a failed domain request from the Arabic error state', async () => {
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okPageJson([makeDomain()])
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper({ retry: false }) })
    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل مجالات التصنيف' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('تقنية المعلومات')).toBeInTheDocument()
  })

  it('creates the exact v1 payload and exposes field errors inline', async () => {
    permissions.canManage = true
    const domain = makeDomain()
    const receivedBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([domain])),
      http.post(`${API_BASE_URL}/catalog/domains`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return errJson(422, {
          code: 'MATERIAL_DOMAINS_CODE_NOT_UNIQUE',
          message: 'Material domain code is not unique.',
          details: { code: ['not unique'] },
        })
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper() })
    await screen.findByText(domain.name)
    await user.click(screen.getByRole('button', { name: 'إضافة مجال' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('اسم المجال'), 'خدمات عامة')
    await user.type(within(dialog).getByLabelText('رمز المجال'), 'GEN')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المجال' }))

    await waitFor(() => expect(receivedBodies).toHaveLength(1))
    // `POST /catalog/domains` binds `name` and `code` ONLY: a new domain is
    // Active by definition, so no `status`, and MaterialDomain is not versioned,
    // so no `rowVersion`.
    expect(receivedBodies).toEqual([{ code: 'GEN', name: 'خدمات عامة' }])
    expect(await within(dialog).findByText('رمز المجال مستخدم مسبقاً.')).toBeInTheDocument()
  })

  it('updates only the domain name, the single field the update route binds', async () => {
    permissions.canManage = true
    const domain = makeDomain()
    let receivedBody: unknown = null
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([domain])),
      http.put(`${API_BASE_URL}/catalog/domains/${domain.id}`, async ({ request }) => {
        receivedBody = await request.json()
        return okJson({ ...domain, name: 'تقنية محدثة' })
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper() })
    await screen.findByText(domain.name)
    await user.click(screen.getByRole('button', { name: `تعديل ${domain.name}` }))
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByLabelText('اسم المجال')
    await user.clear(nameInput)
    await user.type(nameInput, 'تقنية محدثة')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(receivedBody).not.toBeNull())
    // `code` is create-only and the update record binds `Name` alone, so the
    // body is the name and nothing else.
    expect(receivedBody).toEqual({ name: 'تقنية محدثة' })
  })

  it('deactivates through the integer status command', async () => {
    permissions.canManage = true
    const domain = makeDomain()
    const statusBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([domain])),
      http.put(`${API_BASE_URL}/catalog/domains/${domain.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper() })
    await screen.findByText(domain.name)
    await user.click(screen.getByRole('button', { name: `تعطيل ${domain.name}` }))

    const confirmation = await screen.findByRole('alertdialog')
    await user.click(within(confirmation).getByRole('button', { name: 'تعطيل المجال' }))

    await waitFor(() => expect(statusBodies).toHaveLength(1))
    // Status READS are enum names; status WRITES are enum ORDINALS.
    // `{"status":"Inactive"}` is a JSON binding failure on an `int`.
    expect(statusBodies).toEqual([{ status: 1 }])
  })

  it('reactivates an inactive domain with the other ordinal', async () => {
    permissions.canManage = true
    const domain = makeDomain({ status: 'Inactive' })
    const statusBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([domain])),
      http.put(`${API_BASE_URL}/catalog/domains/${domain.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<MaterialDomainsPage />, { wrapper: createWrapper() })
    await screen.findByText(domain.name)
    await user.click(screen.getByRole('button', { name: `تنشيط ${domain.name}` }))
    await user.click(await screen.findByRole('button', { name: 'تنشيط المجال' }))

    await waitFor(() => expect(statusBodies).toEqual([{ status: 0 }]))
  })
})
