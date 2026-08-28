import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UserFormDialog } from '@/modules/admin/components/user-form-dialog'
import { createUserSummary } from '@/test/msw/factories'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function DialogHost({ editing }: { editing: boolean }) {
  const [open, setOpen] = useState(false)
  const user = editing ? createUserSummary({ displayName: 'أحمد محمد', username: 'ahmad.m' }) : null
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        {'فتح نموذج المستخدم'}
      </button>
      <UserFormDialog
        user={open ? user : null}
        open={open}
        isPending={false}
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
  it('opens the create form empty and shows Arabic labels with an Active default', async () => {
    const user = userEvent.setup()
    render(<DialogHost editing={false} />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'فتح نموذج المستخدم' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'إضافة مستخدم' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('اسم المستخدم')).toHaveValue('')
    expect(within(dialog).getByLabelText('اسم الدخول')).toHaveValue('')
    expect(within(dialog).getByLabelText('الحالة')).toHaveTextContent('نشط')
  })

  it('prefills every editable field when editing an existing user', async () => {
    const existing = createUserSummary({
      displayName: 'أحمد محمد',
      username: 'ahmad.m',
      status: 'Suspended',
    })
    render(
      <div>
        <button type="button" onClick={() => undefined}>
          {'فتح'}
        </button>
        <UserFormDialog
          user={existing}
          open
          isPending={false}
          onOpenChange={() => undefined}
          onSubmit={vi.fn()}
        />
      </div>,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'تعديل المستخدم' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('اسم المستخدم')).toHaveValue(existing.displayName)
    expect(within(dialog).getByLabelText('اسم الدخول')).toHaveValue(existing.username)
    expect(within(dialog).getByLabelText('الحالة')).toHaveTextContent('موقوف')
  })

  it('blocks submission and surfaces Arabic validation errors on empty submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة مستخدم' }))

    expect(await within(dialog).findByText('اسم المستخدم مطلوب.')).toBeInTheDocument()
    expect(within(dialog).getByText('اسم الدخول مطلوب.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits contract-shaped create values for a new account', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <UserFormDialog
        user={null}
        open
        isPending={false}
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('اسم المستخدم'), 'سارة علي')
    await user.type(within(dialog).getByLabelText('اسم الدخول'), 'sara.ali')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة مستخدم' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      displayName: 'سارة علي',
      username: 'sara.ali',
      status: 'Active',
    })
  })
})
