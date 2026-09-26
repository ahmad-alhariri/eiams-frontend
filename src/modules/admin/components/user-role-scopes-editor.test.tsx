import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Form } from '@/shared/forms/form'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { UserRoleScopesEditor } from './user-role-scopes-editor'
import {
  toReplaceRoleScopeRequest,
  userRoleScopeSchema,
  type UserRoleScopeFormValues,
} from '../schemas/user-role-scopes.schemas'
import type { RoleRef } from '../types/admin.api-types'
import { useScopedSiteSelector } from '@/modules/organization/hooks/use-scoped-site-selector'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { useSiteSelector } from '@/shared/selectors/adapters/site-selector'
import { useWarehouseSelector } from '@/shared/selectors/adapters/warehouse-selector'
import type {
  EntitySelectorAdapter,
  EntitySelectorResult,
} from '@/shared/selectors/selector-adapter'
import type { Site } from '@/modules/organization/types/organization.api-types'
import type { Warehouse } from '@/modules/warehouse/types/warehouse.api-types'
import { adminService } from '../services/admin.service'

vi.mock('@/modules/organization/hooks/use-scoped-site-selector', () => ({
  useScopedSiteSelector: vi.fn(),
}))
vi.mock('@/modules/warehouse/hooks/use-scoped-warehouse-selector', () => ({
  useScopedWarehouseSelector: vi.fn(),
}))
vi.mock('../services/admin.service', () => ({
  adminService: {
    replaceUserRoleScope: vi.fn(),
    getUserRoleScope: vi.fn(),
  },
}))

const mockedSiteSelector = vi.mocked(useScopedSiteSelector)
const mockedWarehouseSelector = vi.mocked(useScopedWarehouseSelector)

const ROLE_ID = '00000000-0000-4000-8000-0000000000a1'
const SITE_ID = '00000000-0000-4000-8000-000000000071'
const WAREHOUSE_ID = '00000000-0000-4000-8000-000000000072'

function siteAdapter(): EntitySelectorAdapter<Site> {
  return {
    toOption: (entity) => ({ value: String(entity.siteId), label: entity.nameAr, payload: entity }),
    toOptionLabel: (entity) => entity.nameAr,
    searchLabel: (entity) => entity.nameAr,
  }
}

function warehouseAdapter(): EntitySelectorAdapter<Warehouse> {
  return {
    toOption: (entity) => ({
      value: String(entity.warehouseId),
      label: entity.nameAr,
      payload: entity,
    }),
    toOptionLabel: (entity) => entity.nameAr,
    searchLabel: (entity) => entity.nameAr,
  }
}

function setupScopeSelectors(scopeReady = true) {
  const site = siteAdapter()
  const warehouse = warehouseAdapter()
  const siteResult: EntitySelectorResult<Site> = { options: site, scopeReady }
  const warehouseResult: EntitySelectorResult<Warehouse> = { options: warehouse, scopeReady }
  mockedSiteSelector.mockReturnValue({
    ...siteResult,
    loadOptions: vi
      .fn()
      .mockResolvedValue([
        {
          value: String(SITE_ID),
          label: 'المقر الرئيسي',
          payload: { siteId: SITE_ID, nameAr: 'المقر الرئيسي' } as unknown as Site,
        },
      ]),
  })
  mockedWarehouseSelector.mockReturnValue({
    ...warehouseResult,
    loadOptions: vi
      .fn()
      .mockResolvedValue([
        {
          value: String(WAREHOUSE_ID),
          label: 'المستودع المركزي',
          payload: {
            warehouseId: WAREHOUSE_ID,
            nameAr: 'المستودع المركزي',
          } as unknown as Warehouse,
        },
      ]),
  })
}

function createForm(
  initialValues?: Partial<UserRoleScopeFormValues>,
): UseFormReturn<UserRoleScopeFormValues> {
  return useForm({
    resolver: zodResolver(userRoleScopeSchema),
    defaultValues: { roleId: '', scopeType: 'Enterprise', scopeId: null, ...initialValues },
  })
}

function EditorHarness(props: {
  canManage: boolean
  canSelectRoles: boolean
  isPending: boolean
  isRoleCatalogLoading: boolean
  onSubmit: (values: UserRoleScopeFormValues) => Promise<void>
  initialValues?: Partial<UserRoleScopeFormValues>
  roles?: readonly RoleRef[]
}) {
  const form = createForm(props.initialValues)
  return (
    <Form {...form}>
      <UserRoleScopesEditor
        canManage={props.canManage}
        canSelectRoles={props.canSelectRoles}
        form={form}
        isPending={props.isPending}
        isRoleCatalogLoading={props.isRoleCatalogLoading}
        onSubmit={props.onSubmit}
        roles={props.roles ?? [{ roleId: ROLE_ID, nameAr: 'مدير النظام' }]}
      />
    </Form>
  )
}

function renderEditor(
  props: Omit<Parameters<typeof EditorHarness>[0], 'roles'> & { roles?: readonly RoleRef[] },
) {
  return render(<EditorHarness {...props} />)
}

describe('UserRoleScopesEditor', () => {
  beforeEach(() => {
    setupScopeSelectors()
    vi.mocked(adminService.replaceUserRoleScope).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('requires manage permission to render the save button', () => {
    renderEditor({
      canManage: false,
      canSelectRoles: false,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async () => {},
    })

    expect(screen.queryByRole('button', { name: 'حفظ التعيين' })).not.toBeInTheDocument()
    const notice = screen.getAllByText(/لا تملك صلاحية تعديل دور المستخدم/)
    expect(notice.length).toBeGreaterThan(0)
  })

  it('renders the save button when the administrator can manage', () => {
    renderEditor({
      canManage: true,
      canSelectRoles: true,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async () => {},
    })

    expect(screen.getByRole('button', { name: 'حفظ التعيين' })).toBeInTheDocument()
  })

  it('disables the submit button while the save is in flight', () => {
    vi.mocked(adminService.replaceUserRoleScope).mockResolvedValue({
      role: { roleId: ROLE_ID, nameAr: 'مدير النظام' },
      scope: { scopeType: 'Enterprise', scopeId: null, displayName: 'المؤسسة' },
    } as never)

    renderEditor({
      canManage: true,
      canSelectRoles: true,
      isPending: true,
      isRoleCatalogLoading: false,
      onSubmit: async (values) => {
        await adminService.replaceUserRoleScope(
          '00000000-0000-4000-8000-000000000099',
          toReplaceRoleScopeRequest(values),
        )
      },
    })

    const button = screen.getByRole('button', { name: 'حفظ التعيين' })
    expect(button).toBeDisabled()
  })

  it('renders the role as a non-interactive label when the admin cannot select roles', () => {
    renderEditor({
      canManage: true,
      canSelectRoles: false,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async () => {},
      initialValues: { roleId: ROLE_ID, scopeType: 'Enterprise', scopeId: null },
    })

    expect(screen.getByText('مدير النظام')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'الدور' })).not.toBeInTheDocument()
    const notices = screen.getAllByText(/يمكنك تعديل النطاق/)
    expect(notices.length).toBeGreaterThan(0)
  })

  it('renders Enterprise with a static note and no scope entity picker', () => {
    renderEditor({
      canManage: true,
      canSelectRoles: true,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async () => {},
      initialValues: { roleId: ROLE_ID, scopeType: 'Enterprise', scopeId: null },
    })

    expect(
      screen.getByText('يشمل هذا التعيين المؤسسة بالكامل ولا يتطلب اختيار موقع أو مستودع.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'الموقع' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'المستودع' })).not.toBeInTheDocument()
  })

  it('replaces the scope picker when the administrator switches site to warehouse', async () => {
    const user = userEvent.setup()
    renderEditor({
      canManage: true,
      canSelectRoles: true,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async () => {},
      initialValues: { roleId: ROLE_ID, scopeType: 'Site', scopeId: SITE_ID },
    })

    const scopeTypeCombobox = screen.getByRole('combobox', { name: 'النطاق' })
    await user.click(scopeTypeCombobox)
    await user.click(await screen.findByRole('option', { name: 'مستودع' }))

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'المستودع' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('combobox', { name: 'الموقع' })).not.toBeInTheDocument()
  })

  it('clears the scope identifier when the scope type changes', async () => {
    const user = userEvent.setup()
    renderEditor({
      canManage: true,
      canSelectRoles: true,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async () => {},
      initialValues: { roleId: ROLE_ID, scopeType: 'Site', scopeId: SITE_ID },
    })

    const scopeTypeCombobox = screen.getByRole('combobox', { name: 'النطاق' })
    await user.click(scopeTypeCombobox)
    await user.click(await screen.findByRole('option', { name: 'مستودع' }))

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'المستودع' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('combobox', { name: 'الموقع' })).not.toBeInTheDocument()
  })

  it('re-prompts for a site identifier after switching back to site', async () => {
    const user = userEvent.setup()
    renderEditor({
      canManage: true,
      canSelectRoles: true,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async () => {},
      initialValues: { roleId: ROLE_ID, scopeType: 'Warehouse', scopeId: WAREHOUSE_ID },
    })

    const scopeTypeCombobox = screen.getByRole('combobox', { name: 'النطاق' })
    await user.click(scopeTypeCombobox)
    await user.click(await screen.findByRole('option', { name: 'موقع' }))

    const siteCombobox = await screen.findByRole('combobox', { name: 'الموقع' })
    expect(siteCombobox).toBeInTheDocument()
    expect(screen.getByText('يجب إدخال معرّف نطاق صالح.')).toBeInTheDocument()
  })

  it('submits the exact singular transport contract for an Enterprise assignment', async () => {
    const user = userEvent.setup()
    const received: unknown[] = []
    vi.mocked(adminService.replaceUserRoleScope).mockImplementation(
      async (_userId: string, request: unknown) => {
        received.push(request)
        return {
          role: { roleId: ROLE_ID, nameAr: 'مدير النظام' },
          scope: { scopeType: 'Enterprise', scopeId: null, displayName: 'المؤسسة' },
        }
      },
    )

    renderEditor({
      canManage: true,
      canSelectRoles: true,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async (values) => {
        await adminService.replaceUserRoleScope(
          '00000000-0000-4000-8000-000000000099',
          toReplaceRoleScopeRequest(values),
        )
      },
      initialValues: { roleId: ROLE_ID, scopeType: 'Enterprise', scopeId: null },
    })

    await user.click(screen.getByRole('button', { name: 'حفظ التعيين' }))
    await waitFor(() => expect(received).toHaveLength(1))

    expect(received[0]).toEqual({ roleId: ROLE_ID, scopeType: 'Enterprise', scopeId: null })
    expect(Object.keys(received[0] as Record<string, unknown>).sort()).toEqual([
      'roleId',
      'scopeId',
      'scopeType',
    ])
    expect(received[0]).not.toHaveProperty('assignments')
    expect(received[0]).not.toHaveProperty('rowVersion')
  })

  it('submits the exact singular transport contract for a Site assignment', async () => {
    const user = userEvent.setup()
    const received: unknown[] = []
    vi.mocked(adminService.replaceUserRoleScope).mockImplementation(
      async (_userId: string, request: unknown) => {
        received.push(request)
        return {
          role: { roleId: ROLE_ID, nameAr: 'مدير النظام' },
          scope: { scopeType: 'Site', scopeId: SITE_ID, displayName: 'المقر الرئيسي' },
        }
      },
    )

    renderEditor({
      canManage: true,
      canSelectRoles: true,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async (values) => {
        await adminService.replaceUserRoleScope(
          '00000000-0000-4000-8000-000000000099',
          toReplaceRoleScopeRequest(values),
        )
      },
      initialValues: { roleId: ROLE_ID, scopeType: 'Site', scopeId: SITE_ID },
    })

    await user.click(screen.getByRole('button', { name: 'حفظ التعيين' }))
    await waitFor(() => expect(received).toHaveLength(1))

    expect(received[0]).toEqual({ roleId: ROLE_ID, scopeType: 'Site', scopeId: SITE_ID })
    expect(Object.keys(received[0] as Record<string, unknown>).sort()).toEqual([
      'roleId',
      'scopeId',
      'scopeType',
    ])
    expect(received[0]).not.toHaveProperty('assignments')
    expect(received[0]).not.toHaveProperty('rowVersion')
  })

  it('maps the saved assignment back into form defaults on the next render', async () => {
    const user = userEvent.setup()
    const savedRoleId = '00000000-0000-4000-8000-0000000000c3'
    const savedScopeId = '00000000-0000-4000-8000-000000000073'
    const savedRole: RoleRef = { roleId: savedRoleId, nameAr: 'كبير مراجعة' }
    vi.mocked(adminService.replaceUserRoleScope).mockResolvedValue({
      role: savedRole,
      scope: { scopeType: 'Warehouse', scopeId: savedScopeId, displayName: 'مستودع التصدير' },
    })

    const { rerender } = renderEditor({
      canManage: true,
      canSelectRoles: true,
      isPending: false,
      isRoleCatalogLoading: false,
      onSubmit: async (values) => {
        await adminService.replaceUserRoleScope(
          '00000000-0000-4000-8000-000000000099',
          toReplaceRoleScopeRequest(values),
        )
      },
      initialValues: { roleId: ROLE_ID, scopeType: 'Enterprise', scopeId: null },
    })

    await user.click(screen.getByRole('button', { name: 'حفظ التعيين' }))
    await waitFor(() =>
      expect(vi.mocked(adminService.replaceUserRoleScope)).toHaveBeenCalledTimes(1),
    )

    // Rerender with a new key to force React to remount the EditorHarness,
    // which creates a fresh useForm() that picks up the new defaultValues.
    // The Select can then resolve the saved role name from the roles array.
    rerender(
      <EditorHarness
        key="after-save"
        canManage={true}
        canSelectRoles={true}
        isPending={false}
        isRoleCatalogLoading={false}
        onSubmit={async () => {}}
        initialValues={{ roleId: savedRoleId, scopeType: 'Enterprise', scopeId: null }}
        roles={[savedRole]}
      />,
    )

    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'الدور' }).querySelector('[data-slot="select-value"]')
          ?.textContent,
      ).toBe(savedRoleId),
    )
  })
})
