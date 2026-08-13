import { IconSearch } from '@tabler/icons-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmptyState } from '@/shared/feedback/empty-state'
import { ErrorBoundary } from '@/shared/feedback/error-boundary'
import { ErrorState } from '@/shared/feedback/error-state'
import { FullPageSpinner } from '@/shared/feedback/full-page-spinner'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { TableSkeleton } from '@/shared/feedback/table-skeleton'
import { Button } from '@/shared/ui/button'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Loading feedback', () => {
  it('announces loading in Arabic with a decorative spinner icon', () => {
    const { container } = render(<LoadingSpinner label="جاري تحميل الأرصدة..." />)

    expect(screen.getByRole('status', { name: 'جاري تحميل الأرصدة...' })).toHaveTextContent(
      'جاري تحميل الأرصدة...',
    )
    expect(container.querySelector('[data-slot="loading-spinner"]')).toHaveAttribute(
      'aria-live',
      'polite',
    )
    expect(container.querySelector('[data-slot="loading-spinner-icon"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('respects an explicit accessible name and size variant', () => {
    render(<LoadingSpinner aria-label="بحث جارٍ" size="lg" />)

    expect(screen.getByRole('status', { name: 'بحث جارٍ' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'بحث جارٍ' }).querySelector('svg')).toHaveClass(
      'size-12',
    )
  })

  it('renders a full-page spinner with the loading announcement', () => {
    render(<FullPageSpinner label="جاري تحميل صفحة المستودع..." />)

    const spinner = screen.getByRole('status', { name: 'جاري تحميل صفحة المستودع...' })
    expect(spinner.closest('[data-slot="full-page-spinner"]')).toHaveClass(
      'flex',
      'min-h-96',
      'w-full',
    )
    expect(spinner.querySelector('svg')).toHaveClass('size-12')
  })
})

describe('TableSkeleton', () => {
  it('renders an accessible table skeleton with the default row and column counts', () => {
    const { container } = render(<TableSkeleton />)

    const status = screen.getByRole('status', { name: 'جاري تحميل الجدول...' })
    expect(status).toHaveClass('rounded-xl', 'shadow-card')
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(45)
  })

  it('honors custom row and column counts', () => {
    const { container } = render(<TableSkeleton columns={3} rows={4} />)

    expect(screen.getByRole('status', { name: 'جاري تحميل الجدول...' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(15)
  })
})

describe('EmptyState', () => {
  it('renders Arabic defaults and composes an optional action', () => {
    render(
      <EmptyState
        action={
          <Button>
            <IconSearch />
            البحث حسب الفلترة
          </Button>
        }
      />,
    )

    expect(screen.getByRole('heading', { name: 'لا توجد بيانات' })).toBeInTheDocument()
    expect(screen.getByText('لم يتم العثور على سجلات مطابقة.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'البحث حسب الفلترة' })).toHaveClass('bg-primary')
    const section = screen.getByRole('heading', { name: 'لا توجد بيانات' }).closest('section')
    expect(section).toHaveClass('border-dashed', 'text-center')
    expect(section).toHaveAttribute('aria-labelledby')
  })

  it('renders custom Arabic copy and a decorative icon', () => {
    const { container } = render(
      <EmptyState
        icon={<IconSearch className="size-12" aria-hidden />}
        title="لا توجد مستندات"
        description="ابدأ بإنشاء أول مستند استلام."
      />,
    )

    expect(screen.getByRole('heading', { name: 'لا توجد مستندات' })).toBeInTheDocument()
    expect(screen.getByText('ابدأ بإنشاء أول مستند استلام.')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="empty-state-icon"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})

describe('ErrorState', () => {
  it('renders an accessible Arabic error surface with an optional action', () => {
    render(
      <ErrorState
        action={<Button variant="outline">إعادة المحاولة</Button>}
        description="تعذر تحميل بيانات المستودع."
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-destructive/40')
    expect(screen.getByRole('heading', { name: 'حدث خطأ' })).toBeInTheDocument()
    expect(screen.getByText('تعذر تحميل بيانات المستودع.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toHaveClass('border-primary')
    expect(alert).toHaveAttribute('aria-labelledby')
  })

  it('renders custom Arabic copy', () => {
    render(
      <ErrorState title="تعذر الترحيل" description="تأكد من رفع النسخة الموقعة ثم حاول مجددًا." />,
    )

    expect(screen.getByRole('heading', { name: 'تعذر الترحيل' })).toBeInTheDocument()
    expect(screen.getByText('تأكد من رفع النسخة الموقعة ثم حاول مجددًا.')).toBeInTheDocument()
  })
})

describe('ErrorBoundary', () => {
  it('catches render failures without exposing raw error payloads by default', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onError = vi.fn()

    function BrokenPanel(): ReactNode {
      throw new Error('internal query failure')
    }

    render(
      <ErrorBoundary onError={onError}>
        <BrokenPanel />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: 'حدث خطأ' })).toBeInTheDocument()
    expect(screen.queryByText('internal query failure')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('re-renders children after the recovery action once the failure is resolved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()

    function FlakyPanel({ failed }: { failed: boolean }) {
      if (failed) {
        throw new Error('temporary failure')
      }
      return <p>تم تحميل اللوحة</p>
    }

    function Harness() {
      const [failed, setFailed] = useState(true)
      return (
        <>
          <ErrorBoundary>
            <FlakyPanel failed={failed} />
          </ErrorBoundary>
          <button type="button" onClick={() => setFailed(false)}>
            إصلاح اللوحة
          </button>
        </>
      )
    }

    render(<Harness />)

    expect(screen.getByRole('heading', { name: 'حدث خطأ' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إصلاح اللوحة' }))
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    expect(screen.getByText('تم تحميل اللوحة')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'حدث خطأ' })).not.toBeInTheDocument()
  })

  it('passes the caught error and a working reset into a function fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()

    function FlakyPanel({ failed }: { failed: boolean }) {
      if (failed) {
        throw new Error('temporary failure')
      }
      return <p>تم تحميل اللوحة</p>
    }

    function Harness() {
      const [failed, setFailed] = useState(true)
      return (
        <>
          <ErrorBoundary
            fallback={(error, reset) => (
              <div>
                <p>خطأ مخصص: {error.message}</p>
                <button type="button" onClick={reset}>
                  استعادة
                </button>
              </div>
            )}
          >
            <FlakyPanel failed={failed} />
          </ErrorBoundary>
          <button type="button" onClick={() => setFailed(false)}>
            إصلاح اللوحة
          </button>
        </>
      )
    }

    render(<Harness />)

    expect(screen.getByText('خطأ مخصص: temporary failure')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إصلاح اللوحة' }))
    await user.click(screen.getByRole('button', { name: 'استعادة' }))

    expect(screen.getByText('تم تحميل اللوحة')).toBeInTheDocument()
  })

  it('renders a static fallback node as-is', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    function BrokenPanel(): ReactNode {
      throw new Error('internal query failure')
    }

    render(
      <ErrorBoundary fallback={<p>تعذر تحميل هذا القسم.</p>}>
        <BrokenPanel />
      </ErrorBoundary>,
    )

    expect(screen.getByText('تعذر تحميل هذا القسم.')).toBeInTheDocument()
    expect(screen.queryByText('internal query failure')).not.toBeInTheDocument()
  })
})
