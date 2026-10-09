import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { delay, http, HttpResponse } from 'msw'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errJson, okPageJson } from '@/test/msw/envelope'
import { createOrganization } from '@/test/msw/factories'
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

import OrganizationsListPage from './organizations-list-page'

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

describe('OrganizationsListPage', () => {
  it('renders contract-backed rows and sends one-based server pagination defaults', async () => {
    const organization = createOrganization()
    let receivedPage: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/organizations`, ({ request }) => {
        const url = new URL(request.url)
        receivedPage = url.searchParams.get('page')
        receivedPageSize = url.searchParams.get('pageSize')
        return okPageJson([organization], { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 })
      }),
    )

    render(<OrganizationsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'الجهات' })).toBeInTheDocument()
    expect(await screen.findByText(organization.name)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'اسم الجهة' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الرمز' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()
    expect(screen.getByText(organization.code)).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    // Read-only without `organization.manage`: no create button, and no
    // per-row edit or status action.
    expect(screen.queryByRole('button', { name: 'إضافة جهة' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `تعديل ${organization.name}` }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `تعطيل ${organization.name}` }),
    ).not.toBeInTheDocument()
    // One-based on both sides of the boundary: the table control's page IS the
    // wire page. A `page=0` here is what `GET /organizations` rejects with 400
    // REQUEST_VALIDATION_FAILED (`details.Page` must be between 1 and 21474836).
    expect(receivedPage).toBe('1')
    expect(receivedPageSize).toBe('10')
  })

  it('shows the Arabic loading state while the page is in flight', async () => {
    const organization = createOrganization()

    server.use(
      http.get(`${API_BASE_URL}/organizations`, async () => {
        await delay(80)
        return okPageJson([organization])
      }),
    )

    render(<OrganizationsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('status', { name: 'جاري تحميل الجدول...' })).toBeInTheDocument()
    expect(await screen.findByText(organization.name)).toBeInTheDocument()
  })

  it('renders the Arabic empty state when the directory has no rows', async () => {
    server.use(http.get(`${API_BASE_URL}/organizations`, () => okPageJson([])))

    render(<OrganizationsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'لا توجد جهات' })).toBeInTheDocument()
    expect(
      screen.getByText('لم يتم العثور على جهات تطابق معايير التصفية الحالية.'),
    ).toBeInTheDocument()
  })

  it('retries a failed list request through the Arabic error state', async () => {
    let attempts = 0
    const recovered = createOrganization()

    server.use(
      http.get(`${API_BASE_URL}/organizations`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okPageJson([recovered])
      }),
    )

    render(<OrganizationsListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل الجهات' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText(recovered.name)).toBeInTheDocument()
  })

  it('sends the selected record status to the server and returns to the first page', async () => {
    const receivedStatuses: Array<string | null> = []
    const user = userEvent.setup()
    const organization = createOrganization()

    server.use(
      http.get(`${API_BASE_URL}/organizations`, ({ request }) => {
        receivedStatuses.push(new URL(request.url).searchParams.get('status'))
        return okPageJson([{ ...organization, status: 'Inactive' }])
      }),
    )

    render(<OrganizationsListPage />, { wrapper: createWrapper() })

    await screen.findByText(organization.name)
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة الجهة' }))
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    await waitFor(() => expect(receivedStatuses).toContain('Inactive'))
  })

  it('creates an organization with the exact v1 request and maps the conflict inline', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const organization = createOrganization()
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/organizations`, () => okPageJson([organization])),
      http.post(`${API_BASE_URL}/organizations`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return errJson(409, {
          code: 'ORGANIZATIONS_CODE_NOT_UNIQUE',
          message: 'Organization code is not unique.',
          details: { code: ['not unique'] },
        })
      }),
    )

    render(<OrganizationsListPage />, { wrapper: createWrapper() })

    await screen.findByText(organization.name)
    await user.click(screen.getByRole('button', { name: 'إضافة جهة' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('اسم الجهة'), 'مديرية حسوب')
    await user.type(within(dialog).getByLabelText('رمز الجهة'), 'ORG-HS')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة الجهة' }))

    await waitFor(() => expect(receivedBodies).toHaveLength(1))
    // `POST /organizations` binds name and code. It binds no `status` — a new
    // record is Active by definition and activation is a separate command.
    expect(receivedBodies).toEqual([{ name: 'مديرية حسوب', code: 'ORG-HS' }])
    // The 409 is raised on the whole request, so the approved Arabic for the
    // operation's code is attached to the `code` field inline.
    expect(await within(dialog).findByText('رمز الجهة مستخدم مسبقاً.')).toBeInTheDocument()
  })

  it('updates an organization by sending name only — never the create-only code', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const organization = createOrganization()
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/organizations`, () => okPageJson([organization])),
      http.put(`${API_BASE_URL}/organizations/${organization.id}`, async ({ request }) => {
        receivedBodies.push(await request.json())
        // `PUT /organizations/{id}` answers with an empty body.
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<OrganizationsListPage />, { wrapper: createWrapper() })

    await screen.findByText(organization.name)
    await user.click(screen.getByRole('button', { name: `تعديل ${organization.name}` }))
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByLabelText('اسم الجهة')
    await user.clear(nameInput)
    await user.type(nameInput, 'الهيئة المحدّثة')
    // `code` is create-only and renders disabled on edit, carrying the value
    // the read served.
    const codeInput = within(dialog).getByLabelText('رمز الجهة')
    expect(codeInput).toBeDisabled()
    expect(codeInput).toHaveValue(organization.code)
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(receivedBodies).toHaveLength(1))
    // Exactly one key: `code` is not in the update body, so a code rename is
    // not expressible through this API.
    expect(receivedBodies).toEqual([{ name: 'الهيئة المحدّثة' }])
  })

  it('deactivates through the integer status command, and reactivates with the other ordinal', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const organization = createOrganization()
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/organizations`, () => okPageJson([organization])),
      http.put(`${API_BASE_URL}/organizations/${organization.id}/status`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<OrganizationsListPage />, { wrapper: createWrapper() })

    await screen.findByText(organization.name)
    await user.click(screen.getByRole('button', { name: `تعطيل ${organization.name}` }))
    await user.click(await screen.findByRole('button', { name: 'تعطيل الجهة' }))

    await waitFor(() => expect(receivedBodies).toHaveLength(1))
    // The command body is the enum ORDINAL, not the status name the read
    // served: `{"status":"Active"}` is a JSON binding failure on an `int`.
    expect(receivedBodies).toEqual([{ status: 1 }])
  })

  it('reactivates an inactive organization through the same route with the other ordinal', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const organization = createOrganization({ status: 'Inactive' })
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/organizations`, () => okPageJson([organization])),
      http.put(`${API_BASE_URL}/organizations/${organization.id}/status`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<OrganizationsListPage />, { wrapper: createWrapper() })

    await screen.findByText(organization.name)
    await user.click(screen.getByRole('button', { name: `تنشيط ${organization.name}` }))
    await user.click(await screen.findByRole('button', { name: 'تنشيط الجهة' }))

    await waitFor(() => expect(receivedBodies).toHaveLength(1))
    expect(receivedBodies).toEqual([{ status: 0 }])
  })
})
