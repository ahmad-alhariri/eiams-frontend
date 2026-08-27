import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { useState, type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RolePermissionDialog } from '@/modules/admin/components/role-permission-dialog'
import { createPermission, createProblemDetails, createRole } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import type { Role } from '@/shared/types/generated/eiams-v1'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const ROLE_ID = '00000000-0000-4000-8000-000000000014'

const viewPermission = () => createPermission({ code: 'admin.role.view', nameAr: 'عرض الأدوار' })
const managePermission = () =>
  createPermission({
    permissionId: '00000000-0000-4000-8000-0000000000d1',
    code: 'admin.role.manage',
    nameAr: 'إدارة الأدوار',
    descriptionAr: null,
  })

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/** Mirrors the roles catalog wiring: a row action opens the matrix dialog. */
function DialogHost({ role }: { role: Role }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        {`تعديل صلاحيات ${role.nameAr}`}
      </button>
      <RolePermissionDialog role={open ? role : null} open={open} onOpenChange={setOpen} />
    </div>
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('RolePermissionDialog', () => {
  it('opens prefilled with the assigned codes and replaces the complete contract role on save', async () => {
    const user = userEvent.setup()
    const role = createRole({
      roleId: ROLE_ID,
      permissionCodes: ['admin.role.view'],
      rowVersion: 7,
    })
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/admin/permissions`, () =>
        HttpResponse.json([viewPermission(), managePermission()]),
      ),
      http.put(`${API_BASE_URL}/admin/roles/${ROLE_ID}`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json({
          ...role,
          permissionCodes: ['admin.role.view', 'admin.role.manage'],
          rowVersion: 8,
        })
      }),
    )

    render(<DialogHost role={role} />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: `تعديل صلاحيات ${role.nameAr}` }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('تعديل صلاحيات الدور')).toBeInTheDocument()
    const assignedCheckbox = await within(dialog).findByRole('checkbox', { name: 'عرض الأدوار' })
    const manageCheckbox = within(dialog).getByRole('checkbox', { name: 'إدارة الأدوار' })
    expect(assignedCheckbox).toBeChecked()
    expect(manageCheckbox).not.toBeChecked()

    await user.click(manageCheckbox)
    expect(manageCheckbox).toBeChecked()

    await user.click(within(dialog).getByRole('button', { name: 'حفظ الصلاحيات' }))

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
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('unassigns a permission by sending the reduced code list', async () => {
    const user = userEvent.setup()
    const role = createRole({
      roleId: ROLE_ID,
      permissionCodes: ['admin.role.view', 'admin.role.manage'],
      rowVersion: 3,
    })
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/admin/permissions`, () =>
        HttpResponse.json([viewPermission(), managePermission()]),
      ),
      http.put(`${API_BASE_URL}/admin/roles/${ROLE_ID}`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json({ ...role, permissionCodes: ['admin.role.view'], rowVersion: 4 })
      }),
    )

    render(<DialogHost role={role} />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: `تعديل صلاحيات ${role.nameAr}` }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('checkbox', { name: 'إدارة الأدوار' }))
    await user.click(within(dialog).getByRole('button', { name: 'حفظ الصلاحيات' }))

    await waitFor(() =>
      expect(receivedBodies).toEqual([
        {
          code: role.code,
          nameAr: role.nameAr,
          permissionCodes: ['admin.role.view'],
          rowVersion: 3,
          status: role.status,
        },
      ]),
    )
  })

  it('keeps the catalog error state actionable instead of offering an unsafe save', async () => {
    const user = userEvent.setup()
    const role = createRole({ roleId: ROLE_ID })
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/admin/permissions`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json([viewPermission()])
      }),
    )

    render(<DialogHost role={role} />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: `تعديل صلاحيات ${role.nameAr}` }))
    const dialog = await screen.findByRole('dialog')

    expect(
      await within(dialog).findByRole('heading', { name: 'تعذّر تحميل كتالوج الصلاحيات' }),
    ).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'حفظ الصلاحيات' })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'إعادة المحاولة' }))

    expect(await within(dialog).findByRole('checkbox', { name: 'عرض الأدوار' })).toBeInTheDocument()
  })

  it('reports an Arabic empty catalog and maps a contract field error inline', async () => {
    const user = userEvent.setup()
    const emptyRole = createRole({ roleId: ROLE_ID, permissionCodes: [] })

    server.use(http.get(`${API_BASE_URL}/admin/permissions`, () => HttpResponse.json([])))

    const { unmount } = render(<DialogHost role={emptyRole} />, { wrapper: createWrapper() })
    await user.click(screen.getByRole('button', { name: `تعديل صلاحيات ${emptyRole.nameAr}` }))
    expect(await screen.findByText('لا توجد صلاحيات متاحة في الكتالوج الحالي.')).toBeInTheDocument()
    unmount()

    const role = createRole({ roleId: ROLE_ID, permissionCodes: ['admin.role.view'] })
    server.use(
      http.get(`${API_BASE_URL}/admin/permissions`, () =>
        HttpResponse.json([viewPermission(), managePermission()]),
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

    render(<DialogHost role={role} />, { wrapper: createWrapper() })
    await user.click(screen.getByRole('button', { name: `تعديل صلاحيات ${role.nameAr}` }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('checkbox', { name: 'إدارة الأدوار' }))
    await user.click(within(dialog).getByRole('button', { name: 'حفظ الصلاحيات' }))

    expect(await within(dialog).findByText('إحدى الصلاحيات غير متاحة.')).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'إدارة الأدوار' })).toBeChecked()
  })
})
