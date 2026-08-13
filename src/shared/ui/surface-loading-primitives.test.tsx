import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Badge } from '@/shared/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Card and Badge', () => {
  it('provides token-backed surface structure with logical action placement', () => {
    render(
      <Card aria-label="بطاقة المستودع">
        <CardHeader>
          <CardTitle>المستودع الرئيسي</CardTitle>
          <CardDescription>مخزون المواد العامة</CardDescription>
          <CardAction>
            <Badge variant="success">نشط</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>إجمالي المواد: 24</CardContent>
        <CardFooter>آخر تحديث اليوم</CardFooter>
      </Card>,
    )

    const card = screen.getByLabelText('بطاقة المستودع')
    expect(card).toHaveClass('rounded-xl', 'bg-popover', 'shadow-card')
    expect(screen.getByText('المستودع الرئيسي')).toHaveClass('text-lg', 'font-semibold')
    expect(screen.getByText('نشط')).toHaveClass('bg-success', 'text-primary-foreground')
    expect(screen.getByText('نشط').closest('[data-slot="card-action"]')).toHaveClass(
      'justify-self-end',
    )
  })

  it('exposes semantic badge variants without feature-specific status mapping', () => {
    render(
      <>
        <Badge variant="warning">مسودة</Badge>
        <Badge variant="critical">بانتظار إجراء</Badge>
        <Badge variant="destructive">ملغي</Badge>
        <Badge variant="outline">للقراءة فقط</Badge>
      </>,
    )

    expect(screen.getByText('مسودة')).toHaveClass('bg-warning')
    expect(screen.getByText('بانتظار إجراء')).toHaveClass('bg-critical')
    expect(screen.getByText('ملغي')).toHaveClass('bg-destructive')
    expect(screen.getByText('للقراءة فقط')).toHaveClass('border-border', 'bg-transparent')
  })
})

describe('Skeleton', () => {
  it('renders shimmer skeleton with reduced-motion support', () => {
    render(<Skeleton aria-label="هيكل التحميل" className="h-4 w-32" />)

    const skeleton = screen.getByLabelText('هيكل التحميل')
    expect(skeleton).toHaveAttribute('data-slot', 'skeleton')
    expect(skeleton).toHaveClass('rounded-sm', 'before:animate-shimmer')
    expect(skeleton).toHaveClass('motion-reduce:before:animate-none')
  })
})
