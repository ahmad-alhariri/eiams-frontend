import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createPermission, createRole, createSession } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import RolesCatalogPage from './roles-catalog-page'

const API_BASE_URL = '/api/v1'

function createWrapper(permissionCodes?: readonly string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (permissionCodes !== undefined) {
    client.setQueryData(authSessionQueryKey, createSession({ permissionCodes }))
  }

  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('RolesCatalogPage', () => {
  it('renders contract-backed roles and the permission catalog as a read-only Arabic surface', async () => {
    const role = createRole({ permissionCodes: ['admin.role.view', 'admin.role.manage'] })
    const permission = createPermission({ code: 'admin.role.view', nameAr: 'عرض الأدوار' })

    server.use(
      http.get(`${API_BASE_URL}/admin/roles`, () => HttpResponse.json([role])),
      http.get(`${API_BASE_URL}/admin/permissions`, () => HttpResponse.json([permission])),
    )

    render(<RolesCatalogPage />, { wrapper: createWrapper() })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'الأدوار والصلاحيات' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(role.nameAr)).toBeInTheDocument()
    expect(screen.getByText(role.code)).toBeInTheDocument()
    expect(screen.getByText('2 صلاحية')).toBeInTheDocument()
    expect(await screen.findByText(permission.nameAr)).toBeInTheDocument()
    expect(screen.getByText(permission.code)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /إضافة|تعديل|حفظ/ })).not.toBeInTheDocument()
  })

  it('retries a failed roles request from the Arabic error state without affecting the permission catalog', async () => {
    let roleAttempts = 0
    const permission = createPermission()

    server.use(
      http.get(`${API_BASE_URL}/admin/roles`, () => {
        roleAttempts += 1
        return roleAttempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json([createRole()])
      }),
      http.get(`${API_BASE_URL}/admin/permissions`, () => HttpResponse.json([permission])),
    )

    render(<RolesCatalogPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل الأدوار' })).toBeInTheDocument()
    expect(screen.getByText(permission.nameAr)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(roleAttempts).toBe(2))
    expect(await screen.findByText('مدير النظام')).toBeInTheDocument()
  })

  it('renders independent Arabic empty states for both catalog resources', async () => {
    server.use(
      http.get(`${API_BASE_URL}/admin/roles`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/admin/permissions`, () => HttpResponse.json([])),
    )

    render(<RolesCatalogPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'لا توجد أدوار' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'لا توجد صلاحيات' })).toBeInTheDocument()
  })

  it('opens the role permission matrix prefilled from the row action for admin.role.manage holders', async () => {
    const user = userEvent.setup()
    const role = createRole({ permissionCodes: ['admin.role.view'] })
    const viewPermission = createPermission({ code: 'admin.role.view', nameAr: 'عرض الأدوار' })
    const managePermission = createPermission({
      permissionId: '00000000-0000-4000-8000-0000000000d1',
      code: 'admin.role.manage',
      nameAr: 'إدارة الأدوار',
    })

    server.use(
      http.get(`${API_BASE_URL}/admin/roles`, () => HttpResponse.json([role])),
      http.get(`${API_BASE_URL}/admin/permissions`, () =>
        HttpResponse.json([viewPermission, managePermission]),
      ),
    )

    render(<RolesCatalogPage />, {
      wrapper: createWrapper(['admin.role.view', 'admin.role.manage']),
    })

    await user.click(await screen.findByRole('button', { name: `تعديل صلاحيات ${role.nameAr}` }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('تعديل صلاحيات الدور')).toBeInTheDocument()
    expect(await within(dialog).findByRole('checkbox', { name: 'عرض الأدوار' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'إدارة الأدوار' })).not.toBeChecked()
  })
})
