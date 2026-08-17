import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  DocumentConflictDialog,
  type DocumentConflictDialogProps,
} from '@/shared/documents/document-conflict-dialog'

function renderDialog(overrides: Partial<DocumentConflictDialogProps> = {}) {
  const onRecover = vi.fn()
  const onDismiss = vi.fn()
  const props: DocumentConflictDialogProps = {
    isRefreshing: false,
    onRecover,
    onDismiss,
    ...overrides,
  }
  const view = render(<DocumentConflictDialog {...props} />)
  return {
    onDismiss,
    onRecover,
    user: userEvent.setup(),
    rerender: (next: Partial<DocumentConflictDialogProps>) =>
      view.rerender(<DocumentConflictDialog {...props} {...next} />),
  }
}

describe('DocumentConflictDialog', () => {
  it('renders the Arabic conflict copy with both recovery actions when active', async () => {
    renderDialog()

    const dialog = await screen.findByRole('alertdialog', { name: 'تعديل متزامن على السند' })
    expect(dialog).toHaveAccessibleDescription(
      'عدّل مستخدم آخر هذا السند أثناء عملك، ولم يعد ما تعرضه النسخة الأحدث.',
    )
    expect(screen.getByRole('button', { name: 'تحميل النسخة الأحدث' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'البقاء على النسخة الحالية' })).toBeInTheDocument()
    expect(dialog.querySelector('[data-slot="document-conflict-dialog"]')).not.toBeNull()
  })

  it('runs recover from the primary action and swaps in the busy label while refreshing', async () => {
    const { user, onRecover, onDismiss, rerender } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'تحميل النسخة الأحدث' }))
    expect(onRecover).toHaveBeenCalledTimes(1)

    rerender({ isRefreshing: true })

    const busyButton = screen.getByRole('button', { name: 'جارٍ التحميل...' })
    expect(busyButton).toBeDisabled()
    expect(busyButton).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'البقاء على النسخة الحالية' })).toBeDisabled()

    // Escape is blocked while refreshing: the refresh must run to completion.
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses from the secondary action and stays on the stale view', async () => {
    const { user, onDismiss } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'البقاء على النسخة الحالية' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('maps Escape to dismiss when not refreshing', async () => {
    const { onDismiss } = renderDialog()

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalled()
  })
})
