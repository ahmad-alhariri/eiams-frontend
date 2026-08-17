import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createFieldError,
  createPage,
  createProblemDetails,
  createSite,
} from '@/test/msw/factories'
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
    let receivedPageIndex: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/sites`, ({ request }) => {
        const url = new URL(request.url)
        receivedPageIndex = url.searchParams.get('pageIndex')
        receivedPageSize = url.searchParams.get('pageSize')
        return HttpResponse.json(createPage([site], { totalItems: 11, totalPages: 2 }))
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'المواقع' })).toBeInTheDocument()
    expect(await screen.findByText(site.nameAr)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة موقع' })).not.toBeInTheDocument()
    expect(receivedPageIndex).toBe('0')
    expect(receivedPageSize).toBe('10')
  })

  it('retries a failed list request through the Arabic error state', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([createSite()]))
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل المواقع' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('المقر الرئيسي')).toBeInTheDocument()
  })

  it('sends the selected record status to the server and returns to the first page', async () => {
    const receivedStatuses: Array<string | null> = []
    const user = userEvent.setup()

    server.use(
      http.get(`${API_BASE_URL}/sites`, ({ request }) => {
        receivedStatuses.push(new URL(request.url).searchParams.get('status'))
        return HttpResponse.json(createPage([createSite({ status: 'Inactive' })]))
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper() })

    await screen.findByText('المقر الرئيسي')
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
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([site]))),
      http.post(`${API_BASE_URL}/sites`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(
          createProblemDetails({
            fieldErrors: [
              createFieldError({ field: 'code', messageAr: 'رمز الموقع مستخدم مسبقًا.' }),
            ],
          }),
          { status: 422 },
        )
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper() })

    await screen.findByText(site.nameAr)
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
    expect(receivedBodies).toEqual([
      {
        organizationId: '00000000-0000-4000-8000-000000000051',
        code: 'TEST-01',
        nameAr: 'موقع تجريبي',
        governorate: null,
        address: null,
        status: 'Active',
        rowVersion: 0,
      },
    ])
    expect(await within(dialog).findByText('رمز الموقع مستخدم مسبقًا.')).toBeInTheDocument()
  })

  it('updates an existing site while retaining its owner and row version', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const site = createSite({ rowVersion: 7 })
    let receivedBody: unknown = null

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([site]))),
      http.put(`${API_BASE_URL}/sites/${site.siteId}`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ ...site, nameAr: 'المقر المحدّث' })
      }),
    )

    render(<SitesListPage />, { wrapper: createWrapper() })

    await screen.findByText(site.nameAr)
    await user.click(screen.getByRole('button', { name: `تعديل ${site.nameAr}` }))
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByLabelText('اسم الموقع')
    await user.clear(nameInput)
    await user.type(nameInput, 'المقر المحدّث')
    expect(within(dialog).getByLabelText('معرّف الجهة المالكة')).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({
      organizationId: site.organizationId,
      code: site.code,
      nameAr: 'المقر المحدّث',
      governorate: site.governorate,
      address: site.address,
      status: site.status,
      rowVersion: 7,
    })
  })
})
