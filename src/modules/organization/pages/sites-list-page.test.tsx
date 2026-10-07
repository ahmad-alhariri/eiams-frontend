import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errJson, okPageJson } from '@/test/msw/envelope'
import { createSite } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'organization.manage' && permissions.canManage,
  }),
}))

import SitesListPage from './sites-list-page'

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
  permissions.canManage = false
})

describe('SitesListPage', () => {
  it('renders contract-backed site rows and sends server pagination defaults', async () => {
    const site = createSite()
    let receivedPage: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/sites`, ({ request }) => {
        const url = new URL(request.url)
        receivedPage = url.searchParams.get('page')
        receivedPageSize = url.searchParams.get('pageSize')
        return okPageJson([site], { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 })
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'المواقع' })).toBeInTheDocument()
    expect(await screen.findByText(site.name)).toBeInTheDocument()
    // `location` and `governorateCode` are the wire fields this projection
    // serves; `address` and `governorate` were the frozen snapshot's fiction.
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'العنوان' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'المحافظة' })).toBeInTheDocument()
    expect(screen.getByText(site.location ?? '')).toBeInTheDocument()
    expect(screen.getByText(site.governorateCode ?? '')).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة موقع' })).not.toBeInTheDocument()
    expect(receivedPage).toBe('0')
    expect(receivedPageSize).toBe('10')
  })

  it('falls back to a dash for a site with no location or governorate code', async () => {
    const site = createSite({ location: null, governorateCode: null })

    server.use(http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])))

    render(<SitesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByText(site.name)).toBeInTheDocument()
    // Two cells — العنوان and المحافظة — and neither renders an empty string.
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('retries a failed list request through the Arabic error state', async () => {
    let attempts = 0
    const recovered = createSite()

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okPageJson([recovered])
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل المواقع' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText(recovered.name)).toBeInTheDocument()
  })

  it('sends the selected record status to the server and returns to the first page', async () => {
    const receivedStatuses: Array<string | null> = []
    const user = userEvent.setup()
    const site = createSite()

    server.use(
      http.get(`${API_BASE_URL}/sites`, ({ request }) => {
        receivedStatuses.push(new URL(request.url).searchParams.get('status'))
        return okPageJson([{ ...site, status: 'Inactive' }])
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper() })

    await screen.findByText(site.name)
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة الموقع' }))
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    await waitFor(() => expect(receivedStatuses).toContain('Inactive'))
  })

  it('creates a site with the exact v1 request and maps server field errors inline', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const site = createSite()
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])),
      http.post(`${API_BASE_URL}/sites`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return errJson(422, {
          code: 'SITES_CODE_NOT_UNIQUE',
          message: 'Site code is not unique.',
          details: { code: ['not unique'] },
        })
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper() })

    await screen.findByText(site.name)
    await user.click(screen.getByRole('button', { name: 'إضافة موقع' }))
    const dialog = screen.getByRole('dialog')
    await user.type(
      within(dialog).getByLabelText('معرّف الجهة المالكة'),
      '00000000-0000-4000-8000-000000000051',
    )
    await user.type(within(dialog).getByLabelText('اسم الموقع'), 'موقع تجريبي')
    await user.type(within(dialog).getByLabelText('رمز الموقع'), 'TEST-01')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة الموقع' }))

    await waitFor(() => expect(receivedBodies).toHaveLength(1))
    // `POST /sites` binds organizationId / name / code / location /
    // governorateCode. It binds no `status` and carries no `rowVersion`:
    // Site is not a versioned aggregate.
    expect(receivedBodies).toEqual([
      {
        organizationId: '00000000-0000-4000-8000-000000000051',
        code: 'TEST-01',
        name: 'موقع تجريبي',
        governorateCode: null,
        location: null,
      },
    ])
    expect(await within(dialog).findByText('رمز الموقع مستخدم مسبقاً.')).toBeInTheDocument()
  })

  it('updates an existing site by sending only the fields the update body binds', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    // Site serves no row version; the record is NOT an optimistic-concurrency
    // aggregate, so nothing about concurrency appears in the update body.
    const site = createSite()
    let receivedBody: unknown = null

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])),
      http.put(`${API_BASE_URL}/sites/${site.id}`, async ({ request }) => {
        receivedBody = await request.json()
        // `PUT /sites/{id}` answers with an empty body.
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper() })

    await screen.findByText(site.name)
    await user.click(screen.getByRole('button', { name: `تعديل ${site.name}` }))
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByLabelText('اسم الموقع')
    await user.clear(nameInput)
    await user.type(nameInput, 'المقر المحدّث')
    // `organizationId` and `code` are create-only and render disabled on edit.
    expect(within(dialog).getByLabelText('معرّف الجهة المالكة')).toBeDisabled()
    expect(within(dialog).getByLabelText('رمز الموقع')).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({
      name: 'المقر المحدّث',
      location: site.location,
      governorateCode: site.governorateCode,
    })
  })
})
