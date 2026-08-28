import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import {
  createRole,
  createSession,
  createUserRoleScope,
  createUserSummary,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import UserDetailPage from './user-detail-page'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
const permissions = vi.hoisted(() => ({ canManage: true, canViewRoles: true }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const USER_ID = '00000000-0000-4000-8000-000000000099'
const SITE_ID = '00000000-0000-4000-8000-000000000071'
const ROLE_A = createRole({ roleId: '00000000-0000-4000-8000-0000000000a1', nameAr: 'مدير النظام' })
const ROLE_B = createRole({ roleId: '00000000-0000-4000-8000-0000000000b2', nameAr: 'مدقق' })

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(
    authSessionQueryKey,
    createSession({
      permissionCodes: [
        'admin.user.view',
        ...(permissions.canManage ? ['admin.user.manage'] : []),
        ...(permissions.canViewRoles ? ['admin.role.view'] : []),
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

function seedRoleScopes() {
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
    http.get(`${API_BASE_URL}/admin/users/${USER_ID}/role-scopes`, () =>
      HttpResponse.json([
        createUserRoleScope({
          role: createRole({ roleId: ROLE_A.roleId, nameAr: 'مدير النظام' }),
          scope: { scopeType: 'Enterprise', scopeId: null, displayName: 'المؤسسة' },
        }),
      ]),
    ),
    http.get(`${API_BASE_URL}/admin/roles`, () => HttpResponse.json([ROLE_A, ROLE_B])),
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  permissions.canManage = true
  permissions.canViewRoles = true
})

describe('UserDetailPage', () => {
  it('lists the user role-scopes and replaces the full assignment set on save', async () => {
    const user = userEvent.setup()
    const receivedBodies: unknown[] = []
    seedRoleScopes()
    server.use(
      http.put(`${API_BASE_URL}/admin/users/${USER_ID}/role-scopes`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json([
          createUserRoleScope({
            role: createRole({ roleId: ROLE_A.roleId, nameAr: 'مدير النظام' }),
            scope: { scopeType: 'Enterprise', scopeId: null, displayName: 'المؤسسة' },
          }),
          createUserRoleScope({
            role: createRole({ roleId: ROLE_B.roleId, nameAr: 'مدقق' }),
            scope: { scopeType: 'Site', scopeId: 'site-1', displayName: 'موقع' },
          }),
        ])
      }),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: 'تفاصيل المستخدم' })).toBeInTheDocument()

    // The seeded Enterprise assignment for ROLE_A is loaded. The role name only
    // renders inside the Radix Select content (mounted on open), so open the
    // existing role select to confirm the assignment's role.
    const comboboxes = await screen.findAllByRole('combobox')
    await user.click(comboboxes[0]!)
    expect(await screen.findByText('مدير النظام')).toBeInTheDocument()
    await user.keyboard('{Escape}')

    // Add a second assignment for ROLE_B scoped to a Site.
    await user.click(screen.getByRole('button', { name: 'إضافة تعيين' }))
    // Each assignment row renders two selects (role, then scope). After adding,
    // comboboxes are [role0, scope0, role1, scope1]; the new row's role select
    // is the second-to-last combobox and its scope select is the last.
    const combos = await screen.findAllByRole('combobox')
    const newRoleSelect = combos.at(-2)!
    await user.click(newRoleSelect)
    const roleOptions = await screen.findAllByRole('option')
    const roleBOption = roleOptions.find((option) => (option.textContent ?? '').includes('مدقق'))
    expect(roleBOption).toBeDefined()
    await user.click(roleBOption!)
    const scopeSelects = screen.getAllByRole('combobox')
    const newScopeSelect = scopeSelects.at(-1)!
    await user.click(newScopeSelect)
    const scopeOptions = await screen.findAllByRole('option')
    const siteOption = scopeOptions.find((option) => (option.textContent ?? '').includes('موقع'))
    expect(siteOption).toBeDefined()
    await user.click(siteOption!)
    const scopeInputs = screen.getAllByRole('textbox', { name: 'معرّف النطاق' })
    await user.type(scopeInputs.at(-1)!, SITE_ID)

    await user.click(screen.getByRole('button', { name: 'حفظ التعيينات' }))

    await waitFor(() =>
      expect(receivedBodies).toEqual([
        {
          assignments: [
            { roleId: ROLE_A.roleId, scopeId: null, scopeType: 'Enterprise' },
            { roleId: ROLE_B.roleId, scopeId: SITE_ID, scopeType: 'Site' },
          ],
          rowVersion: 7,
        },
      ]),
    )
    // The mutation settled (button returns to its idle, enabled state) — the
    // PUT replaced the full assignment set with ROLE_B + Site as asserted above.
    const saveButton = await screen.findByRole('button', { name: 'حفظ التعيينات' })
    expect(saveButton).toBeEnabled()
  })

  it('blocks incomplete assignments with Arabic inline validation', async () => {
    const user = userEvent.setup()
    seedRoleScopes()
    render(<UserDetailPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: 'إضافة تعيين' }))
    await user.click(screen.getByRole('button', { name: 'حفظ التعيينات' }))

    expect(await screen.findByText('يجب اختيار دور صالح.')).toBeInTheDocument()
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
      seedRoleScopes()
      server.use(
        http.get(`${API_BASE_URL}/admin/roles`, () => {
          roleCatalogRequests += 1
          return new HttpResponse(null, { status: 403 })
        }),
      )

      render(<UserDetailPage />, { wrapper: PageWrapper })

      expect(await screen.findByText('مدير النظام')).toBeInTheDocument()
      await waitFor(() => expect(roleCatalogRequests).toBe(0))
      expect(screen.queryByRole('button', { name: 'إضافة تعيين' })).not.toBeInTheDocument()
      if (canManage) {
        expect(screen.getByRole('button', { name: 'حفظ التعيينات' })).toBeInTheDocument()
        expect(
          screen.getByText(/تتطلب إضافة دور أو تغييره صلاحية عرض الأدوار/u),
        ).toBeInTheDocument()
      } else {
        expect(screen.queryByRole('button', { name: 'حفظ التعيينات' })).not.toBeInTheDocument()
        expect(screen.getByText(/عرض للقراءة فقط/u)).toBeInTheDocument()
      }
    },
  )

  it.each([
    {
      status: 409,
      body: {
        status: 409,
        code: 'admin.user_conflict',
        titleAr: 'تغيرت بيانات المستخدم. حدّث الصفحة ثم حاول مجدداً.',
        traceId: 'trace-conflict',
      },
      expected: 'تغيرت بيانات المستخدم. حدّث الصفحة ثم حاول مجدداً.',
    },
    {
      status: 422,
      body: {
        status: 422,
        code: 'validation.failed',
        titleAr: 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.',
        traceId: 'trace-validation',
        fieldErrors: [
          {
            field: 'assignments',
            code: 'invalid_scope',
            messageAr: 'يتعذر إسناد الدور إلى النطاق المحدد.',
          },
        ],
      },
      expected: 'يتعذر إسناد الدور إلى النطاق المحدد.',
    },
  ])('renders Arabic mutation feedback for HTTP $status', async ({ status, body, expected }) => {
    const user = userEvent.setup()
    seedRoleScopes()
    server.use(
      http.put(`${API_BASE_URL}/admin/users/${USER_ID}/role-scopes`, () =>
        HttpResponse.json(body, { status }),
      ),
    )
    render(<UserDetailPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: 'حفظ التعيينات' }))

    expect(await screen.findByText(expected)).toBeInTheDocument()
  })

  it('renders an actionable Arabic error state when the role-scopes request fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/admin/users/${USER_ID}`, () =>
        HttpResponse.json(createUserSummary({ userId: USER_ID, rowVersion: 7 })),
      ),
      http.get(
        `${API_BASE_URL}/admin/users/${USER_ID}/role-scopes`,
        () => new HttpResponse(null, { status: 500 }),
      ),
      http.get(`${API_BASE_URL}/admin/roles`, () => HttpResponse.json([ROLE_A])),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تعيينات المستخدم' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  })
})
