import { IconPlus } from '@tabler/icons-react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'

describe('PageHeader', () => {
  it('renders title, subtitle, and an action cluster with token-backed styling', () => {
    render(
      <PageHeader
        actions={
          <>
            <Button>
              <IconPlus />
              إضافة مادة
            </Button>
            <Button variant="outline">تصدير</Button>
          </>
        }
        subtitle="إدارة المواد والتصنيف"
        title="المواد"
      />,
    )

    const section = screen.getByRole('heading', { name: 'المواد' }).closest('section')
    expect(section).toHaveClass('rounded-xl', 'border', 'bg-popover', 'shadow-card')
    expect(section).toHaveAttribute('aria-labelledby')

    const heading = screen.getByRole('heading', { name: 'المواد', level: 1 })
    expect(heading).toHaveClass('text-xl', 'font-semibold')
    expect(screen.getByText('إدارة المواد والتصنيف')).toHaveClass(
      'text-sm',
      'text-muted-foreground',
    )
    expect(screen.getByRole('button', { name: 'إضافة مادة' })).toHaveClass('bg-primary')
    expect(screen.getByRole('button', { name: 'تصدير' })).toHaveClass('border-primary')
  })

  it('renders an optional toolbar separated from the title row', () => {
    render(
      <PageHeader title="المستودعات" toolbar={<input aria-label="بحث" placeholder="بحث..." />} />,
    )

    const toolbar = screen
      .getByPlaceholderText('بحث...')
      .closest('[data-slot="page-header-toolbar"]')
    expect(toolbar).toHaveClass('border-t', 'border-border')
    expect(screen.getByLabelText('بحث')).toBeInTheDocument()
  })

  it('uses an explicit title id when the surrounding landmark needs a stable label', () => {
    render(<PageHeader title="لوحة المتابعة" titleId="dashboard-title" />)

    const heading = screen.getByRole('heading', { level: 1, name: 'لوحة المتابعة' })
    const section = heading.closest('section')

    expect(heading).toHaveAttribute('id', 'dashboard-title')
    expect(section).toHaveAttribute('aria-labelledby', 'dashboard-title')
  })

  it('omits the toolbar divider when neither toolbar nor children are provided', () => {
    const { container } = render(<PageHeader title="المواد" />)

    expect(container.querySelector('[data-slot="page-header-toolbar"]')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('uses children as a fallback toolbar slot', () => {
    render(
      <PageHeader title="المواد">
        <div>فلتر الحالة</div>
      </PageHeader>,
    )

    expect(
      screen.getByText('فلتر الحالة').closest('[data-slot="page-header-toolbar"]'),
    ).toBeInTheDocument()
  })
})
