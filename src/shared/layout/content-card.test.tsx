import { IconDownload } from '@tabler/icons-react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ContentCard } from '@/shared/layout/content-card'
import { Button } from '@/shared/ui/button'

describe('ContentCard', () => {
  it('renders title, description, action, body, and footer sections', () => {
    render(
      <ContentCard
        action={
          <Button variant="ghost">
            <IconDownload />
            تصدير
          </Button>
        }
        description="أرصدة المستودع الرئيسي"
        footer={<span>آخر تحديث: اليوم</span>}
        title="الأرصدة"
      >
        <p>الجدول هنا</p>
      </ContentCard>,
    )

    const section = screen.getByText('الجدول هنا').closest('section')
    expect(section).toHaveClass('mb-6', 'rounded-xl', 'border', 'bg-popover', 'p-6', 'shadow-card')
    expect(section).toHaveAttribute('data-slot', 'content-card')

    expect(screen.getByText('الأرصدة')).toHaveClass('text-lg', 'font-semibold')
    expect(screen.getByText('أرصدة المستودع الرئيسي')).toHaveClass(
      'text-sm',
      'text-muted-foreground',
    )
    const action = screen.getByRole('button', { name: 'تصدير' })
    expect(action.closest('[data-slot="card-action"]')).toHaveClass('justify-self-end')
    expect(screen.getByText('آخر تحديث: اليوم').closest('[data-slot="card-footer"]')).toHaveClass(
      'border-t',
    )
  })

  it('renders a bare surface when no header or footer is provided', () => {
    const { container } = render(<ContentCard>المحتوى فقط</ContentCard>)

    expect(screen.getByText('المحتوى فقط')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="card-header"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-slot="card-footer"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-slot="card-action"]')).not.toBeInTheDocument()
  })

  it('merges caller className and data attributes', () => {
    const { container } = render(
      <ContentCard className="mt-4" data-testid="content-card-test">
        محتوى
      </ContentCard>,
    )

    const section = container.querySelector('[data-slot="content-card"]')
    expect(section).toHaveClass('mt-4', 'mb-6')
    expect(section).toHaveAttribute('data-testid', 'content-card-test')
  })
})
