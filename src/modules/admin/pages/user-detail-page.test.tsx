import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { setOrganizationService } from '@/modules/organization/services/organization.service'
import { setWarehouseService } from '@/modules/warehouse/services/warehouse.service'
import { createAxiosTransport } from '@/shared/api/axios-transport'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createRole,
  createSession,
  createSite,
  createUserRoleScope,
  createUserSummary,
  createWarehouse,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import UserDetailPage from './user-detail-page'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
const permissions = vi.hoisted(() => ({ canManage: true, canViewRoles: true }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const ABSOLUTE_API_BASE_URL = 'http://localhost/api/v1'
const USER_ID = '00000000-0000-4000-8000-000000000099'
const SITE_ID = '00000000-0000-4000-8000-000000000071'
const ROLE_A = createRole({ roleId: '00000000-0000-4000-8000-0000000000a1', nameAr: 'مدير النظام' })
const ROLE_B = createRole({ roleId: '00000000-0000-4000-8000-0000000000b2', nameAr: 'مدقق' })
const SITE = createSite({ siteId: SITE_ID, nameAr: 'المقر الرئيسي' })
const WAREHOUSE = createWarehouse({
  warehouseId: '00000000-0000-4000-8000-000000000072',
  nameAr: 'المستودع المركزي',
})

const bundles: ApiClientBundle[] = []

function envelope<T>(data: T) {
  return {
    success: true as const,
    data,
    pagination: {
      page: 1,
      pageSize: 10,
      totalItems: Array.isArray(data) ? data.length : 1,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    },
    meta: { requestId: 'test-req-1', timestampUtc: '2026-09-15T12:00:00.000Z' },
  }
}

beforeAll(() => {
  const bundle = createApiClient({ baseURL: ABSOLUTE_API_BASE_URL })
  bundles.push(bundle)
  setOrganizationService(createAxiosTransport(bundle.client))
  setWarehouseService(createAxiosTransport(bundle.client))
})

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(
    authSessionQueryKey,
    createSession({
      permissionCodes: [
        'users:view',
        ...(permissions.canManage ? ['users:manage'] : []),
        ...(permissions.canViewRoles ? ['roles:view'] : []),
      ],
    }),
  )
  return (
    <MemoryRouter initialEntries={[`/admin/users/${USER_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/admin/users/:userId" element={children} />
          <Route path="/admin/users" element={<p>قائمة المستخدمين</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

function seedRoleScope() {
  server.use(
    http.get(`${API_BASE_URL}/admin/users/${USER_ID}`, () =>
      HttpResponse.json(
        createUserSummary({
          userId: USER_ID,
          username: 'review.user',
          displayName: 'مستخدم المراجعة',
          rowVersion: 7,
        }),
      ),
    ),
    http.get(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, () =>
      HttpResponse.json({
        role: { roleId: ROLE_A.roleId, nameAr: 'مدير النظام' },
        scope: { scopeType: 'Enterprise', scopeId: null, displayName: 'المؤسسة' },
      }),
    ),
    http.get(`${API_BASE_URL}/admin/roles`, () => HttpResponse.json([ROLE_A, ROLE_B])),
    http.get(`${ABSOLUTE_API_BASE_URL}/sites`, () => HttpResponse.json(envelope([SITE]))),
    http.get(`${ABSOLUTE_API_BASE_URL}/warehouses`, () => HttpResponse.json(envelope([WAREHOUSE]))),
  )
}

afterAll(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  permissions.canManage = true
  permissions.canViewRoles = true
})

describe('UserDetailPage', () => {
  it('loads the singular assignment and replaces it on save', async () => {
    const user = userEvent.setup()
    const receivedBodies: unknown[] = []
    seedRoleScope()
    server.use(
      http.put(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json({
          role: { roleId: ROLE_B.roleId, nameAr: 'مدقق' },
          scope: { scopeType: 'Enterprise', scopeId: null, displayName: 'المؤسسة' },
        })
      }),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: 'تفاصيل المستخدم' })).toBeInTheDocument()

    // The seeded Enterprise assignment for ROLE_A is loaded; the role name
    // renders inside the Radix Select content once opened.
    const comboboxes = await screen.findAllByRole('combobox')
    await user.click(comboboxes[0]!)
    expect(await screen.findByText('مدير النظام')).toBeInTheDocument()
    const roleBOption = await screen.findByRole('option', { name: 'مدقق' })
    await user.click(roleBOption)

    await user.click(screen.getByRole('button', { name: 'حفظ التعيين' }))

    await waitFor(() =>
      expect(receivedBodies).toEqual([
        { roleId: ROLE_B.roleId, scopeType: 'Enterprise', scopeId: null },
      ]),
    )
    const saveButton = await screen.findByRole('button', { name: 'حفظ التعيين' })
    expect(saveButton).toBeEnabled()
  })

  it('selects a Site scope through the Arabic async picker', async () => {
    const user = userEvent.setup()
    const receivedBodies: unknown[] = []
    seedRoleScope()
    server.use(
      http.put(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(
          createUserRoleScope({
            role: createRole({ roleId: ROLE_A.roleId, nameAr: 'مدير النظام' }),
            scope: { scopeType: 'Site', scopeId: SITE_ID, displayName: 'المقر الرئيسي' },
          }),
        )
      }),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    const comboboxes = await screen.findAllByRole('combobox')
    // Second combobox is the scope-type select: switch Enterprise to Site.
    await user.click(comboboxes[1]!)
    await user.click(await screen.findByRole('option', { name: 'موقع' }))

    // Saving without a site selection is blocked with Arabic inline validation.
    await user.click(screen.getByRole('button', { name: 'حفظ التعيين' }))
    expect(await screen.findByText('يجب إدخال معرّف نطاق صالح.')).toBeInTheDocument()
    expect(receivedBodies).toHaveLength(0)

    // Pick the site through the async search picker, then save. The matched
    // query is highlighted with <mark>, so options are queried by role.
    await user.click(screen.getByRole('combobox', { name: 'الموقع' }))
    await user.type(screen.getByRole('combobox', { name: 'الموقع' }), 'المقر')
    await user.click(await screen.findByRole('option', { name: 'المقر الرئيسي' }))

    await user.click(screen.getByRole('button', { name: 'حفظ التعيين' }))

    await waitFor(() =>
      expect(receivedBodies).toEqual([
        { roleId: ROLE_A.roleId, scopeType: 'Site', scopeId: SITE_ID },
      ]),
    )
  })

  it('clears the scope selection when switching back to Enterprise', async () => {
    const user = userEvent.setup()
    const receivedBodies: unknown[] = []
    seedRoleScope()
    server.use(
      http.put(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json({
          role: { roleId: ROLE_A.roleId, nameAr: 'مدير النظام' },
          scope: { scopeType: 'Enterprise', scopeId: null, displayName: 'المؤسسة' },
        })
      }),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    const comboboxes = await screen.findAllByRole('combobox')
    await user.click(comboboxes[1]!)
    await user.click(await screen.findByRole('option', { name: 'مستودع' }))

    await user.click(screen.getByRole('combobox', { name: 'المستودع' }))
    await user.type(screen.getByRole('combobox', { name: 'المستودع' }), 'المركزي')
    await user.click(await screen.findByRole('option', { name: 'المستودع المركزي' }))

    // Switching back to Enterprise drops the warehouse pick: no picker, null scope.
    const scopeCombobox = await screen.findByRole('combobox', { name: 'النطاق' })
    await user.click(scopeCombobox)
    await user.click(await screen.findByRole('option', { name: 'المؤسسة' }))
    expect(
      screen.getByText('يشمل هذا التعيين المؤسسة بالكامل ولا يتطلب اختيار موقع أو مستودع.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'حفظ التعيين' }))

    await waitFor(() =>
      expect(receivedBodies).toEqual([
        { roleId: ROLE_A.roleId, scopeType: 'Enterprise', scopeId: null },
      ]),
    )
  })

  it.each([
    { canManage: false, canViewRoles: false, label: 'read-only user viewer' },
    { canManage: false, canViewRoles: true, label: 'read-only user and role viewer' },
    { canManage: true, canViewRoles: false, label: 'user manager without role-catalog access' },
  ])(
    'does not request an unused role catalog for a $label',
    async ({ canManage, canViewRoles }) => {
      let roleCatalogRequests = 0
      permissions.canManage = canManage
      permissions.canViewRoles = canViewRoles
      seedRoleScope()
      server.use(
        http.get(`${API_BASE_URL}/admin/roles`, () => {
          roleCatalogRequests += 1
          return new HttpResponse(null, { status: 403 })
        }),
      )

      render(<UserDetailPage />, { wrapper: PageWrapper })

      expect(await screen.findByText('مدير النظام')).toBeInTheDocument()
      await waitFor(() => expect(roleCatalogRequests).toBe(0))
      if (canManage) {
        expect(screen.getByRole('button', { name: 'حفظ التعيين' })).toBeInTheDocument()
        expect(screen.getByText(/يتطلب تغيير الدور صلاحية عرض الأدوار/u)).toBeInTheDocument()
      } else {
        expect(screen.queryByRole('button', { name: 'حفظ التعيين' })).not.toBeInTheDocument()
        expect(screen.getByText(/عرض للقراءة فقط/u)).toBeInTheDocument()
      }
    },
  )

  it.each([
    {
      status: 422,
      body: {
        status: 422,
        code: 'validation.failed',
        titleAr: 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.',
        traceId: 'trace-validation',
        fieldErrors: [
          {
            field: 'scopeId',
            code: 'invalid_scope',
            messageAr: 'يتعذر إسناد الدور إلى النطاق المحدد.',
          },
        ],
      },
      expected: 'يتعذر إسناد الدور إلى النطاق المحدد.',
    },
    {
      status: 500,
      body: {
        status: 500,
        code: 'admin.unexpected',
        titleAr: 'حدث خطأ غير متوقع. حاول مجدداً.',
        traceId: 'trace-unexpected',
      },
      expected: 'حدث خطأ غير متوقع. حاول مجدداً.',
    },
  ])('renders Arabic mutation feedback for HTTP $status', async ({ status, body, expected }) => {
    const user = userEvent.setup()
    seedRoleScope()
    server.use(
      http.put(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, () =>
        HttpResponse.json(body, { status }),
      ),
    )
    render(<UserDetailPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: 'حفظ التعيين' }))

    expect(await screen.findByText(expected)).toBeInTheDocument()
  })

  it('renders an actionable Arabic error state when the role-scope request fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/admin/users/${USER_ID}`, () =>
        HttpResponse.json(createUserSummary({ userId: USER_ID, rowVersion: 7 })),
      ),
      http.get(
        `${API_BASE_URL}/admin/users/${USER_ID}/role-scope`,
        () => new HttpResponse(null, { status: 500 }),
      ),
      http.get(`${API_BASE_URL}/admin/roles`, () => HttpResponse.json([ROLE_A])),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تعيين المستخدم' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  })
})
