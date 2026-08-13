import { act, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { toast } from '@/shared/ui/toast-manager'
import { Toaster } from '@/shared/ui/toaster'

afterEach(() => {
  vi.useRealTimers()
})

function showSuccess(title = 'تم الحفظ', description?: string) {
  act(() => {
    toast.success({ title, description })
  })
}

function showError(title = 'تعذر الحفظ') {
  act(() => {
    toast.error({ title })
  })
}

describe('Toast system', () => {
  it('renders imperative success toasts with Arabic copy and variant styling', () => {
    render(<Toaster />)

    showSuccess('تم الحفظ', 'تمت مزامنة البيانات')

    expect(screen.getByText('تم الحفظ')).toBeInTheDocument()
    expect(screen.getByText('تمت مزامنة البيانات')).toBeInTheDocument()
    const root = screen.getByText('تم الحفظ').closest('[data-slot="toast-root"]')
    expect(root).toHaveAttribute('data-type', 'success')
    expect(root).toHaveClass('shadow-toast', 'data-[type=success]:border-success')
    expect(root).toHaveClass('motion-reduce:data-[starting-style]:animate-none')
  })

  it('renders error toasts with destructive presentation and a close control', () => {
    const { container } = render(<Toaster />)

    showError('تعذر الحفظ')

    const root = container.querySelector('[data-slot="toast-root"]')
    expect(root).toHaveAttribute('data-type', 'error')
    expect(root).toHaveClass('shadow-toast', 'data-[type=error]:border-error')
    expect(within(root as HTMLElement).getByText('تعذر الحفظ')).toBeInTheDocument()

    const close = root?.querySelector('[data-slot="toast-close"]')
    expect(close).toHaveAttribute('aria-label', 'إغلاق الإشعار')
    expect(screen.getByRole('alert').textContent).toContain('تعذر الحفظ')
  })

  it('dismisses a toast when its close control is activated', async () => {
    const user = userEvent.setup()
    render(<Toaster />)

    showSuccess()
    expect(screen.getByText('تم الحفظ')).toBeInTheDocument()

    await user.hover(screen.getByText('تم الحفظ'))
    await user.click(screen.getByRole('button', { name: 'إغلاق الإشعار' }))

    await waitFor(() => expect(screen.queryByText('تم الحفظ')).not.toBeInTheDocument())
  })

  it('auto-dismisses success toasts after five seconds while error toasts persist', () => {
    vi.useFakeTimers()
    const { container } = render(<Toaster />)

    showSuccess()
    showError()

    expect(screen.getByText('تم الحفظ')).toBeInTheDocument()
    const errorRoot = container.querySelector('[data-slot="toast-root"][data-type="error"]')
    expect(within(errorRoot as HTMLElement).getByText('تعذر الحفظ')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(6000)
    })

    expect(container.querySelector('[data-slot="toast-root"]')).toHaveAttribute(
      'data-type',
      'error',
    )
    expect(screen.queryByText('تم الحفظ')).not.toBeInTheDocument()
  })

  it('transitions a promise toast from loading to success', async () => {
    render(<Toaster />)

    let resolvePromise: (value: string) => void = () => {}
    const pending = new Promise<string>((resolve) => {
      resolvePromise = resolve
    })

    act(() => {
      toast.promise(pending, {
        loading: 'جارٍ الحفظ',
        success: 'تم الحفظ',
        error: 'فشل الحفظ',
      })
    })
    expect(screen.getByText('جارٍ الحفظ')).toBeInTheDocument()

    await act(async () => {
      resolvePromise('ok')
      await pending
    })

    expect(screen.queryByText('جارٍ الحفظ')).not.toBeInTheDocument()
    expect(screen.getByText('تم الحفظ')).toBeInTheDocument()
  })
})
