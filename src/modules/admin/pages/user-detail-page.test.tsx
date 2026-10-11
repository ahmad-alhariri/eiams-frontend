import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { errJson, okJson, okPageJson } from '@/test/msw/envelope'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import {
  createRoleProjection,
  createSession,
  createUserRoleScope,
  createUserDetail,
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
const ROLE_A = createRoleProjection({
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'SYSTEM_ADMIN',
  nameAr: 'مدير النظام',
  // Enterprise-only, so the editor must not offer Site or Warehouse for it.
  allowedScopeTypes: ['Enterprise'],
  rowVersion: 3,
})
const ROLE_B = createRoleProjection({
  id: '00000000-0000-4000-8000-0000000000b2',
  name: 'WH_MGR',
  nameAr: 'مدير المستودع',
  allowedScopeTypes: ['Site', 'Warehouse'],
  rowVersion: 5,
})

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(
    authSessionQueryKey,
    createSession({
      permissionCodes: [
        'admin.user.view',
        ...(permissions.canManage ? ['admin.user.manage'] : []),
        ...(permissions.canViewRoles ? ['admin.role.view'] : []),
        'sites.view',
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

function seedEnterpriseAssignment() {
  server.use(
    http.get(`${API_BASE_URL}/admin/users/${USER_ID}`, () =>
      okJson(createUserDetail({ id: USER_ID })),
    ),
    // The singular resource (D-SRS-01): one object, never a collection.
    http.get(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, () =>
      okJson(
        createUserRoleScope({
          id: '00000000-0000-4000-8000-0000000000c1',
          roleId: ROLE_A.id,
          roleName: ROLE_A.name,
          scopeType: 'Enterprise',
          scopeId: null,
          rowVersion: 4,
        }),
      ),
    ),
    http.get(`${API_BASE_URL}/admin/roles`, () => okPageJson([ROLE_A, ROLE_B])),
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  permissions.canManage = true
  permissions.canViewRoles = true
})

describe('UserDetailPage', () => {
  it('replaces the single assignment with the role scope and version it was read at', async () => {
    const user = userEvent.setup()
    const receivedBodies: unknown[] = []
    seedEnterpriseAssignment()
    server.use(
      http.get(`${API_BASE_URL}/sites`, () =>
        okPageJson([
          { siteId: SITE_ID, code: 'ALE', nameAr: 'موقع حلب', rowVersion: 1, status: 'Active' },
        ]),
      ),
      http.put(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return okJson(
          createUserRoleScope({
            roleId: ROLE_B.id,
            roleName: ROLE_B.name,
            scopeType: 'Site',
            scopeId: SITE_ID,
            rowVersion: 5,
          }),
        )
      }),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: 'تفاصيل المستخدم' })).toBeInTheDocument()

    // Switch the role to WH_MGR, which permits Site, then choose the site target.
    await user.click(await screen.findByRole('combobox', { name: /الدور/ }))
    await user.click(await screen.findByRole('option', { name: ROLE_B.nameAr }))

    // Choosing a role whose allowedScopeTypes excludes Enterprise must move the
    // scope type off Enterprise, otherwise the save would be refused by the server.
    await user.click(await screen.findByRole('combobox', { name: /النطاق/ }))
    await user.click(await screen.findByRole('option', { name: 'موقع' }))

    // AsyncSelect's Base UI input carries the combobox role, not textbox.
    await user.click(await screen.findByRole('combobox', { name: 'موقع' }))
    await user.type(screen.getByRole('combobox', { name: 'موقع' }), 'حلب')
    await user.click(await screen.findByRole('option', { name: /موقع حلب/ }))

    await user.click(screen.getByRole('button', { name: 'حفظ التعيين' }))

    await waitFor(() =>
      expect(receivedBodies).toEqual([
        {
          roleId: ROLE_B.id,
          scopeType: 'Site',
          scopeId: SITE_ID,
          // The assignment's own version, not the user summary's rowVersion of 7.
          expectedRowVersion: 4,
        },
      ]),
    )
    expect(screen.getByRole('button', { name: 'حفظ التعيين' })).toBeEnabled()
  })

  it('keeps the Arabic role label in the closed role trigger', async () => {
    seedEnterpriseAssignment()
    render(<UserDetailPage />, { wrapper: PageWrapper })

    // Guards the shared `Select` label-resolution fix: the closed role trigger
    // must keep rendering the resolved Arabic label, never the role's raw UUID.
    const roleTrigger = await screen.findByRole('combobox', { name: /الدور/ })
    await waitFor(() => expect(roleTrigger).toHaveTextContent(ROLE_A.nameAr))
    expect(roleTrigger).toHaveTextContent('مدير النظام')
    expect(roleTrigger).not.toHaveTextContent(ROLE_A.id)
  })

  it('offers only the scope types the chosen role permits', async () => {
    const user = userEvent.setup()
    seedEnterpriseAssignment()
    render(<UserDetailPage />, { wrapper: PageWrapper })

    // SYSTEM_ADMIN is Enterprise-only.
    await user.click(await screen.findByRole('combobox', { name: /النطاق/ }))
    expect(await screen.findByRole('option', { name: 'مستوى المؤسسة' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'مستودع' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'موقع' })).not.toBeInTheDocument()
  })

  it('hides the scope identifier for an Enterprise assignment and offers no add-row action', async () => {
    seedEnterpriseAssignment()
    render(<UserDetailPage />, { wrapper: PageWrapper })

    expect(
      await screen.findByText(/نطاق المؤسسة لا يتطلب تحديد موقع أو مستودع/u),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'مستودع' })).not.toBeInTheDocument()
    // D-SRS-01: one assignment, always. There is no way to add a second row.
    expect(screen.queryByRole('button', { name: /إضافة تعيين/ })).not.toBeInTheDocument()
  })

  it('blocks a missing role with Arabic inline validation', async () => {
    const user = userEvent.setup()
    // A user with no assignment starts with an empty role, which is the only
    // state where the required-role rule can be violated.
    server.use(
      http.get(`${API_BASE_URL}/admin/users/${USER_ID}`, () =>
        okJson(createUserDetail({ id: USER_ID })),
      ),
      http.get(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, () =>
        errJson(404, {
          code: 'UserRoleScopes.AssignmentNotFound',
          message: 'The user does not have a role and scope assignment',
        }),
      ),
      http.get(`${API_BASE_URL}/admin/roles`, () => okPageJson([ROLE_A, ROLE_B])),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: 'حفظ التعيين' }))

    expect(await screen.findByText('يجب اختيار دور صالح.')).toBeInTheDocument()
  })

  it('submits version zero for a user who has no assignment yet', async () => {
    const user = userEvent.setup()
    const receivedBodies: unknown[] = []
    server.use(
      http.get(`${API_BASE_URL}/admin/users/${USER_ID}`, () =>
        okJson(createUserDetail({ id: USER_ID })),
      ),
      http.get(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, () =>
        // The backend answers AssignmentNotFound when the row is absent, and the
        // service translates that to null rather than an error.
        errJson(404, {
          code: 'UserRoleScopes.AssignmentNotFound',
          message: 'The user does not have a role and scope assignment',
        }),
      ),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/admin/roles`, () => okPageJson([ROLE_A, ROLE_B])),
      http.put(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return okJson(
          createUserRoleScope({ roleId: ROLE_A.id, roleName: ROLE_A.name, rowVersion: 1 }),
        )
      }),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    // The empty assignment is a normal state, not an error state.
    expect(await screen.findByRole('button', { name: 'حفظ التعيين' })).toBeInTheDocument()

    await user.click(await screen.findByRole('combobox', { name: /الدور/ }))
    await user.click(await screen.findByRole('option', { name: ROLE_A.nameAr }))
    await user.click(screen.getByRole('button', { name: 'حفظ التعيين' }))

    await waitFor(() =>
      expect(receivedBodies).toEqual([
        { roleId: ROLE_A.id, scopeType: 'Enterprise', scopeId: null, expectedRowVersion: 0 },
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
      seedEnterpriseAssignment()
      server.use(
        http.get(`${API_BASE_URL}/admin/roles`, () => {
          roleCatalogRequests += 1
          return new HttpResponse(null, { status: 403 })
        }),
      )

      render(<UserDetailPage />, { wrapper: PageWrapper })

      // Without role-catalog access the role is shown from the assignment's own code,
      // never invented and never fetched.
      expect(await screen.findByText(ROLE_A.name)).toBeInTheDocument()
      await waitFor(() => expect(roleCatalogRequests).toBe(0))

      if (canManage) {
        expect(screen.getByRole('button', { name: 'حفظ التعيين' })).toBeInTheDocument()
        expect(screen.getByText(/تتطلب تغيير الدور صلاحية عرض الأدوار/u)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /إضافة تعيين/ })).not.toBeInTheDocument()
      } else {
        expect(screen.queryByRole('button', { name: 'حفظ التعيين' })).not.toBeInTheDocument()
        expect(screen.getByText(/عرض للقراءة فقط/u)).toBeInTheDocument()
      }
    },
  )

  it.each([
    {
      status: 409,
      // Normalised from the C# `UserRoleScopes.RowVersionMismatch`, which the
      // backend emits and `normalizeWireErrorCode` upper-snake-cases.
      code: 'USER_ROLE_SCOPES_ROW_VERSION_MISMATCH',
      details: {},
      expected: 'تغيرت البيانات من قبل مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
    },
    {
      status: 409,
      code: 'USER_ROLE_SCOPES_ROLE_NOT_ALLOWED_AT_SCOPE',
      details: {},
      // The screen prefers detailAr when the code carries one, because it tells the
      // administrator what to change.
      expected: 'اختر دوراً مسموحاً في هذا النطاق.',
    },
    {
      status: 403,
      code: 'USER_ROLE_SCOPES_ASSIGNMENT_OUTSIDE_ADMINISTRATOR_SCOPE',
      details: {},
      expected: 'الإسناد المطلوب خارج نطاق صلاحيتك الإدارية.',
    },
  ])(
    'renders Arabic mutation feedback for HTTP $status $code',
    async ({ status, code, details, expected }) => {
      const user = userEvent.setup()
      seedEnterpriseAssignment()
      server.use(
        http.put(`${API_BASE_URL}/admin/users/${USER_ID}/role-scope`, () =>
          errJson(status, { code, details }),
        ),
      )
      render(<UserDetailPage />, { wrapper: PageWrapper })

      await user.click(await screen.findByRole('button', { name: 'حفظ التعيين' }))

      expect(await screen.findByText(expected)).toBeInTheDocument()
    },
  )

  it('renders an actionable Arabic error state when the assignment request fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/admin/users/${USER_ID}`, () =>
        okJson(createUserDetail({ id: USER_ID })),
      ),
      http.get(
        `${API_BASE_URL}/admin/users/${USER_ID}/role-scope`,
        () => new HttpResponse(null, { status: 500 }),
      ),
      http.get(`${API_BASE_URL}/admin/roles`, () => okPageJson([ROLE_A])),
    )

    render(<UserDetailPage />, { wrapper: PageWrapper })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تعيين المستخدم' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  })
})
