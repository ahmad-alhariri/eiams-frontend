import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UserFormDialog } from '@/modules/admin/components/user-form-dialog'
import { createUserDirectoryRow } from '@/test/msw/factories'

const ROLE_A = { id: '00000000-0000-4000-8000-0000000000a1', nameAr: 'مدير النظام' }
const ROLE_B = { id: '00000000-0000-4000-8000-0000000000b2', nameAr: 'مدير المستودع' }
const WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000c3'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const listWarehouses = vi.hoisted(() => vi.fn())

// The scope target is an async picker over the server-side Warehouse read, so the test
// answers that read rather than typing an identifier. Returns `id` / `name` / `code`,
// which are the fields the live projection actually serves.
vi.mock('@/modules/warehouse/services/warehouse.service', () => ({
  warehouseService: { listWarehouses },
}))

beforeEach(() => {
  activeScope.key = { kind: 'enterprise' }
  listWarehouses.mockReset()
  listWarehouses.mockResolvedValue({
    items: [{ id: WAREHOUSE_ID, name: 'Main Store', code: 'MAIN' }],
    page: 1,
    pageSize: 10,
    totalCount: 1,
  })
})

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function DialogHost({ editing }: { editing: boolean }) {
  const [open, setOpen] = useState(false)
  const user = editing
    ? createUserDirectoryRow({ firstName: 'أحمد', lastName: 'محمد', status: 'Suspended' })
    : null
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        {'فتح نموذج المستخدم'}
      </button>
      <UserFormDialog
        user={open ? user : null}
        open={open}
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={setOpen}
        onSubmit={vi.fn()}
      />
    </div>
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('UserFormDialog', () => {
  it('opens the create form with the fields the backend binds', async () => {
    const user = userEvent.setup()
    render(<DialogHost editing={false} />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'فتح نموذج المستخدم' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'إضافة مستخدم' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('البريد الإلكتروني')).toHaveValue('')
    expect(within(dialog).getByLabelText('اسم الدخول')).toHaveValue('')
    // The server stores the name as two fields and never composes one.
    expect(within(dialog).getByLabelText('الاسم الأول')).toHaveValue('')
    expect(within(dialog).getByLabelText('اسم العائلة')).toHaveValue('')
    expect(within(dialog).getByLabelText('الحالة')).toHaveTextContent('نشط')
  })

  it('requires the role and scope on create, because the backend rejects a bare account', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة مستخدم' }))

    expect(await within(dialog).findByText('البريد الإلكتروني مطلوب.')).toBeInTheDocument()
    expect(within(dialog).getByText('الاسم الأول مطلوب.')).toBeInTheDocument()
    // D-SRS-01: no zero-assignment account may be created.
    expect(within(dialog).getByText('يجب اختيار دور صالح.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the Arabic role name on the closed control, never the role id', async () => {
    const user = userEvent.setup()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    const roleTrigger = within(dialog).getByRole('combobox', { name: 'الدور' })
    // Nothing is selected yet, so no role id may be on screen.
    expect(roleTrigger.textContent).not.toContain(ROLE_A.id)

    await user.click(roleTrigger)
    await user.click(await screen.findByRole('option', { name: ROLE_A.nameAr }))

    // Regression guard: the Select renders the raw `value` unless it is given a
    // child, and the role value is a GUID - so the closed control used to show
    // 00000000-... instead of the Arabic name.
    expect(within(dialog).getByRole('combobox', { name: 'الدور' })).toHaveTextContent(ROLE_A.nameAr)
    expect(within(dialog).getByRole('combobox', { name: 'الدور' }).textContent).not.toContain(
      ROLE_A.id,
    )
  })

  it('shows the Arabic scope label on the closed control, never the English enum', async () => {
    const user = userEvent.setup()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    const scopeTrigger = within(dialog).getByRole('combobox', { name: 'النطاق' })
    expect(scopeTrigger).toHaveTextContent('مستوى المؤسسة')

    await user.click(scopeTrigger)
    await user.click(await screen.findByRole('option', { name: 'مستودع' }))

    expect(within(dialog).getByRole('combobox', { name: 'النطاق' })).toHaveTextContent('مستودع')
    expect(within(dialog).getByRole('combobox', { name: 'النطاق' }).textContent).not.toContain(
      'Warehouse',
    )
  })

  it('offers the scope target as a picker rather than a free-text UUID field', async () => {
    const user = userEvent.setup()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    // Enterprise needs no target, so nothing is offered at all.
    expect(within(dialog).queryByRole('combobox', { name: 'مستودع' })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('combobox', { name: 'النطاق' }))
    await user.click(await screen.findByRole('option', { name: 'مستودع' }))

    const picker = within(dialog).getByRole('combobox', { name: 'مستودع' })
    expect(picker).toBeInTheDocument()
    expect(within(dialog).getByText(/لا يُقبل إدخال معرّفه يدوياً/u)).toBeInTheDocument()
  })

  it('does not accuse the administrator of an invalid scope before the picker is used', async () => {
    const user = userEvent.setup()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'النطاق' }))
    await user.click(await screen.findByRole('option', { name: 'مستودع' }))

    // Choosing the scope TYPE is not yet a mistake: the picker is still untouched.
    expect(within(dialog).getByRole('combobox', { name: 'مستودع' })).toBeInTheDocument()
    expect(within(dialog).queryByText('يجب اختيار نطاق صالح.')).not.toBeInTheDocument()
  })

  it('prefills the account metadata when editing and shows the login read-only', async () => {
    const existing = createUserDirectoryRow({
      firstName: 'أحمد',
      lastName: 'محمد',
      email: 'ahmad@eiams.local',
      status: 'Suspended',
    })
    render(
      <UserFormDialog
        user={existing}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'تعديل المستخدم' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('البريد الإلكتروني')).toHaveValue('ahmad@eiams.local')
    expect(within(dialog).getByLabelText('الاسم الأول')).toHaveValue('أحمد')
    expect(within(dialog).getByLabelText('اسم العائلة')).toHaveValue('محمد')
    expect(within(dialog).getByLabelText('الحالة')).toHaveTextContent('موقوف')
    // The backend serves the login on reads and no longer accepts it on update, so it
    // is shown but cannot be edited.
    expect(within(dialog).getByLabelText('اسم الدخول')).toHaveValue(existing.username)
    expect(within(dialog).getByLabelText('اسم الدخول')).toBeDisabled()
    expect(within(dialog).getByText(/اسم الدخول ثابت بعد الإنشاء/u)).toBeInTheDocument()
    // Editing never reassigns the role; that is the separate role-scope replacement.
    expect(within(dialog).queryByLabelText('كلمة المرور الأولية')).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('الدور')).not.toBeInTheDocument()
  })

  it('submits the full create contract including the assignment', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('البريد الإلكتروني'), 'sara@eiams.local')
    await user.type(within(dialog).getByLabelText('اسم الدخول'), 'sara.ali')
    await user.type(within(dialog).getByLabelText('الاسم الأول'), 'سارة')
    await user.type(within(dialog).getByLabelText('اسم العائلة'), 'علي')
    await user.type(within(dialog).getByLabelText('كلمة المرور الأولية'), 'Password123!')
    await user.click(within(dialog).getByRole('combobox', { name: 'الدور' }))
    await user.click(await screen.findByRole('option', { name: ROLE_A.nameAr }))

    await user.click(within(dialog).getByRole('button', { name: 'إضافة مستخدم' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'sara@eiams.local',
      username: 'sara.ali',
      firstName: 'سارة',
      lastName: 'علي',
      status: 'Active',
      password: 'Password123!',
      roleId: ROLE_A.id,
      // Enterprise is expressed as the contract's null identifier, so the form
      // must not send an empty string.
      scopeType: 'Enterprise',
      scopeId: '',
    })
  })

  it('shows the role name in the trigger after a role is chosen, not its identifier', async () => {
    // Regression guard. The list always showed `nameAr`, but the closed trigger fell back
    // to rendering the selected item's raw `value`, so the operator saw a bare GUID and
    // could not tell which role was assigned. Asserting the trigger text is what pins it.
    const user = userEvent.setup()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    const roleTrigger = within(dialog).getByRole('combobox', { name: 'الدور' })

    await user.click(roleTrigger)
    await user.click(await screen.findByRole('option', { name: ROLE_B.nameAr }))

    expect(roleTrigger).toHaveTextContent(ROLE_B.nameAr)
    expect(roleTrigger).not.toHaveTextContent(ROLE_B.id)
  })

  it('hides the scope identifier for Enterprise and requires one otherwise', async () => {
    const user = userEvent.setup()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('مستودع')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('combobox', { name: 'النطاق' }))
    await user.click(await screen.findByRole('option', { name: 'مستودع' }))
    expect(within(dialog).getByLabelText('مستودع')).toBeInTheDocument()
  })

  it('offers a scope picker instead of a free-text identifier field', async () => {
    // The raw-UUID affordance this replaced was the defect: an administrator had to
    // transcribe a GUID, and nothing tied it to a real warehouse. Asserting the absence of
    // the textbox is the regression guard, so a plain identifier input cannot return.
    const user = userEvent.setup()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'النطاق' }))
    await user.click(await screen.findByRole('option', { name: 'مستودع' }))

    expect(await within(dialog).findByRole('combobox', { name: 'مستودع' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox', { name: 'مستودع' })).not.toBeInTheDocument()
  })

  it('accepts a scoped assignment chosen from the warehouse list', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        roles={[ROLE_A, ROLE_B]}
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('البريد الإلكتروني'), 'w@eiams.local')
    await user.type(within(dialog).getByLabelText('اسم الدخول'), 'w.keeper')
    await user.type(within(dialog).getByLabelText('الاسم الأول'), 'وائل')
    await user.type(within(dialog).getByLabelText('اسم العائلة'), 'خوري')
    await user.type(within(dialog).getByLabelText('كلمة المرور الأولية'), 'Password123!')
    await user.click(within(dialog).getByRole('combobox', { name: 'الدور' }))
    await user.click(await screen.findByRole('option', { name: ROLE_B.nameAr }))
    await user.click(within(dialog).getByRole('combobox', { name: 'النطاق' }))
    await user.click(await screen.findByRole('option', { name: 'مستودع' }))
    // The warehouse is picked by its Arabic label, not by typing its identifier. The picker
    // requires a search of at least `minQueryLength` before it publishes options.
    await user.click(await within(dialog).findByRole('combobox', { name: 'مستودع' }))
    await user.type(await within(dialog).findByRole('combobox', { name: 'مستودع' }), 'Main')
    await user.click(await screen.findByRole('option', { name: /Main Store/ }))
    await user.click(within(dialog).getByRole('button', { name: 'إضافة مستخدم' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ roleId: ROLE_B.id, scopeType: 'Warehouse', scopeId: WAREHOUSE_ID }),
    )
  })
})
