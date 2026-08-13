import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDialog, type ConfirmDialogProps } from '@/shared/ui/confirm-dialog'

function renderDialog(overrides: Partial<ConfirmDialogProps> = {}) {
  const onOpenChange = vi.fn()
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const props: ConfirmDialogProps = {
    open: true,
    onOpenChange,
    message: 'لا يمكن التراجع عن هذا الإجراء.',
    onConfirm,
    onCancel,
    ...overrides,
  }
  render(<ConfirmDialog {...props} />)
  return { onCancel, onConfirm, onOpenChange, user: userEvent.setup() }
}

describe('ConfirmDialog', () => {
  it('renders the Arabic title, message, and default action buttons with an accessible name', async () => {
    const { user, onConfirm } = renderDialog({ title: 'حذف المادة نهائياً' })

    const dialog = await screen.findByRole('alertdialog', { name: 'حذف المادة نهائياً' })
    expect(dialog).toHaveAccessibleDescription('لا يمكن التراجع عن هذا الإجراء.')
    expect(screen.getByRole('button', { name: 'تأكيد' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'تأكيد' }))
    expect(onConfirm).toHaveBeenCalledWith(undefined)
  })

  it('uses warning treatment and a triangle icon for the confirm variant', () => {
    renderDialog()

    const media = screen.getByRole('alertdialog').querySelector('[data-slot="alert-dialog-media"]')
    expect(media).toHaveClass('bg-warning/10', 'text-warning')
    expect(media?.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'تأكيد' })).toHaveClass('bg-primary')
  })

  it('uses destructive treatment and a circle icon for the destructive variant', () => {
    renderDialog({ variant: 'destructive' })

    const media = screen.getByRole('alertdialog').querySelector('[data-slot="alert-dialog-media"]')
    expect(media).toHaveClass('bg-destructive/10', 'text-destructive')
    expect(media?.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'تأكيد' })).toHaveClass('bg-destructive')
  })

  it('blocks an empty confirm while requireReason is set and shows an Arabic inline error', async () => {
    const { user, onConfirm } = renderDialog({
      requireReason: true,
      reasonPlaceholder: 'اكتب سبب الإجراء...',
    })

    await user.click(screen.getByRole('button', { name: 'تأكيد' }))

    expect(screen.getByRole('alert')).toHaveTextContent('سبب الإجراء مطلوب')
    expect(onConfirm).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('سبب الإجراء'), 'تعديل على سعر المادة')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'تأكيد' }))
    expect(onConfirm).toHaveBeenCalledWith('تعديل على سعر المادة')
  })

  it('passes the entered reason to onConfirm when the reason field is present', async () => {
    const { user, onConfirm } = renderDialog({
      reasonLabel: 'سبب الإجراء',
      onReasonChange: vi.fn(),
    })

    await user.type(screen.getByLabelText('سبب الإجراء'), '   رفض مؤقت   ')
    await user.click(screen.getByRole('button', { name: 'تأكيد' }))

    expect(onConfirm).toHaveBeenCalledWith('رفض مؤقت')
  })

  it('calls onCancel and closes when the cancel button is pressed', async () => {
    const { user, onCancel, onOpenChange } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'إلغاء' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('disables both buttons and blocks Escape close while busy', () => {
    const { onOpenChange } = renderDialog({ busy: true })

    const confirmButton = screen.getByRole('button', { name: 'جارٍ التنفيذ...' })
    expect(confirmButton).toBeDisabled()
    expect(confirmButton).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled()

    fireEvent.keyDown(document, { key: 'Escape' })
    const dialog = screen.getByRole('alertdialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(dialog).toBeInTheDocument()
  })
})
