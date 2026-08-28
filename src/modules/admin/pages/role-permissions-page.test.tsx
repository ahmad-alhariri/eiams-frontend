import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import {
  createPermission,
  createProblemDetails,
  createRole,
  createSession,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import RolePermissionsPage from './role-permissions-page'

const API_BASE_URL = '/api/v1'
const ROLE_ID = '00000000-0000-4000-8000-000000000014'

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(
    authSessionQueryKey,
    createSession({
      permissionCodes: permissions.canManage
        ? ['admin.role.view', 'admin.role.manage']
        : ['admin.role.view'],
    }),
  )
  return (
    <MemoryRouter initialEntries={[`/admin/roles/${ROLE_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/admin/roles/:roleId" element={children} />
          <Route path="/admin/roles" element={<p>قائمة الأدوار</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

afterEach(() => {
  permissions.canManage = false
})

describe('RolePermissionsPage', () => {
  it('keeps the contract catalog visible but hides replacement controls without admin.role.manage', async () => {
    const role = createRole({ roleId: ROLE_ID, permissionCodes: ['admin.role.view'] })
    const viewPermission = createPermission({ code: 'admin.role.view', nameAr: 'عرض الأدوار' })
    const managePermission = createPermission({
      code: 'admin.role.manage',
      nameAr: 'إدارة الأدوار',
    })
    server.use(
      http.get(`${API_BASE_URL}/admin/roles/${ROLE_ID}`, () => HttpResponse.json(role)),
      http.get(`${API_BASE_URL}/admin/permissions`, () =>
        HttpResponse.json([viewPermission, managePermission]),
      ),
    )

    render(<RolePermissionsPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { level: 1, name: role.nameAr })).toBeInTheDocument()
    expect(screen.getByText('عرض الأدوار')).toBeInTheDocument()
    expect(screen.getByText('مُسندة')).toBeInTheDocument()
    expect(screen.getByText('غير مُسندة')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'حفظ الصلاحيات' })).not.toBeInTheDocument()
  })

  it('confirms and sends the complete contract replacement including the current rowVersion', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const role = createRole({
      roleId: ROLE_ID,
      permissionCodes: ['admin.role.view'],
      rowVersion: 7,
    })
    const viewPermission = createPermission({ code: 'admin.role.view', nameAr: 'عرض الأدوار' })
    const managePermission = createPermission({
      code: 'admin.role.manage',
      nameAr: 'إدارة الأدوار',
    })
    const receivedBodies: unknown[] = []
    server.use(
      http.get(`${API_BASE_URL}/admin/roles/${ROLE_ID}`, () => HttpResponse.json(role)),
      http.get(`${API_BASE_URL}/admin/permissions`, () =>
        HttpResponse.json([viewPermission, managePermission]),
      ),
      http.put(`${API_BASE_URL}/admin/roles/${ROLE_ID}`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json({
          ...role,
          permissionCodes: ['admin.role.view', 'admin.role.manage'],
        })
      }),
    )

    render(<RolePermissionsPage />, { wrapper: PageWrapper })

    const manageCheckbox = (await screen.findAllByRole('checkbox'))[1]
    if (manageCheckbox === undefined) throw new Error('لم يظهر مربع صلاحية الإدارة.')
    expect(manageCheckbox).toHaveAccessibleName('إدارة الأدوار')
    await user.click(manageCheckbox)
    await user.click(screen.getByRole('button', { name: 'حفظ الصلاحيات' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'تأكيد حفظ صلاحيات الدور' })
    await user.click(within(confirmation).getByRole('button', { name: 'حفظ الصلاحيات' }))

    await waitFor(() =>
      expect(receivedBodies).toEqual([
        {
          code: role.code,
          nameAr: role.nameAr,
          permissionCodes: ['admin.role.view', 'admin.role.manage'],
          rowVersion: 7,
          status: role.status,
        },
      ]),
    )
  })

  it('keeps the selected matrix and maps a contract field error inline', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const role = createRole({ roleId: ROLE_ID, permissionCodes: ['admin.role.view'] })
    const viewPermission = createPermission({ code: 'admin.role.view', nameAr: 'عرض الأدوار' })
    const managePermission = createPermission({
      code: 'admin.role.manage',
      nameAr: 'إدارة الأدوار',
    })
    server.use(
      http.get(`${API_BASE_URL}/admin/roles/${ROLE_ID}`, () => HttpResponse.json(role)),
      http.get(`${API_BASE_URL}/admin/permissions`, () =>
        HttpResponse.json([viewPermission, managePermission]),
      ),
      http.put(`${API_BASE_URL}/admin/roles/${ROLE_ID}`, () =>
        HttpResponse.json(
          createProblemDetails({
            fieldErrors: [
              {
                field: 'permissionCodes',
                code: 'forbidden',
                messageAr: 'إحدى الصلاحيات غير متاحة.',
              },
            ],
          }),
          { status: 422 },
        ),
      ),
    )

    render(<RolePermissionsPage />, { wrapper: PageWrapper })

    const manageCheckbox = (await screen.findAllByRole('checkbox'))[1]
    if (manageCheckbox === undefined) throw new Error('لم يظهر مربع صلاحية الإدارة.')
    expect(manageCheckbox).toHaveAccessibleName('إدارة الأدوار')
    await user.click(manageCheckbox)
    await user.click(screen.getByRole('button', { name: 'حفظ الصلاحيات' }))
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'تأكيد حفظ صلاحيات الدور' })).getByRole(
        'button',
        { name: 'حفظ الصلاحيات' },
      ),
    )

    expect(await screen.findByText('إحدى الصلاحيات غير متاحة.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'إدارة الأدوار' })).toBeChecked()
  })
})
