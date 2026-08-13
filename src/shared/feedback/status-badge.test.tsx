import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusBadge } from '@/shared/feedback/status-badge'

describe('StatusBadge document statuses', () => {
  it('maps the full generic document lifecycle with Arabic labels and semantics', () => {
    render(
      <>
        <StatusBadge entity="document" status="Draft" />
        <StatusBadge entity="document" status="Submitted" />
        <StatusBadge entity="document" status="Posted" />
        <StatusBadge entity="document" status="Reversed" />
        <StatusBadge entity="document" status="Cancelled" />
        <StatusBadge entity="document" status="Rejected" />
      </>,
    )

    expect(screen.getByText('مسودة')).toHaveClass('bg-warning')
    expect(screen.getByText('بانتظار الترحيل')).toHaveClass('bg-success')
    expect(screen.getByText('مرحّل')).toHaveClass('bg-primary')
    expect(screen.getByText('معكوس')).toHaveClass('border-border', 'bg-transparent')
    expect(screen.getByText('ملغي')).toHaveClass('bg-destructive')
    expect(screen.getByText('مرفوض')).toHaveClass('bg-critical')
  })

  it('adds a confirmation icon to Posted while other statuses stay text-only', () => {
    const { container } = render(
      <>
        <StatusBadge entity="document" status="Posted" />
        <StatusBadge entity="document" status="Draft" />
      </>,
    )

    expect(container.querySelectorAll('[data-slot="status-badge-icon"]')).toHaveLength(1)
    expect(container.querySelector('[data-slot="status-badge-icon"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.getByText('مرحّل').closest('[data-slot="badge"]')).toHaveAttribute(
      'data-status',
      'Posted',
    )
  })
})

describe('StatusBadge other entities', () => {
  it('covers the adjustment lifecycle with shared label entries', () => {
    render(
      <>
        <StatusBadge entity="adjustment" status="Draft" />
        <StatusBadge entity="adjustment" status="Posted" />
        <StatusBadge entity="adjustment" status="Reversed" />
      </>,
    )

    expect(screen.getAllByText('مسودة')).toHaveLength(1)
    expect(screen.getAllByText('مرحّل')).toHaveLength(1)
    expect(screen.getAllByText('معكوس')).toHaveLength(1)
  })

  it('maps asset derived statuses with distinct semantic treatments', () => {
    render(
      <>
        <StatusBadge entity="asset" status="InStock" />
        <StatusBadge entity="asset" status="Issued" />
        <StatusBadge entity="asset" status="InCustody" />
        <StatusBadge entity="asset" status="Disposed" />
      </>,
    )

    expect(screen.getByText('في المخزن')).toHaveClass('bg-success')
    expect(screen.getByText('مصروف')).toHaveClass('bg-primary')
    expect(screen.getByText('قيد العهدة')).toHaveClass('bg-success')
    expect(screen.getByText('مستبعد')).toHaveClass('bg-destructive')
  })

  it('maps custody, inventory-count, record, and user statuses', () => {
    render(
      <>
        <StatusBadge entity="custody" status="Active" />
        <StatusBadge entity="custody" status="Closed" />
        <StatusBadge entity="inventory-count" status="Planned" />
        <StatusBadge entity="inventory-count" status="InProgress" />
        <StatusBadge entity="inventory-count" status="Completed" />
        <StatusBadge entity="inventory-count" status="Closed" />
        <StatusBadge entity="record" status="Active" />
        <StatusBadge entity="record" status="Inactive" />
        <StatusBadge entity="user" status="Active" />
        <StatusBadge entity="user" status="Suspended" />
      </>,
    )

    expect(screen.getByText('نشطة')).toHaveClass('bg-success')
    expect(screen.getByText('مغلقة')).toHaveClass('border-border', 'bg-transparent')
    expect(screen.getByText('مخطط')).toHaveClass('bg-warning')
    expect(screen.getByText('جارٍ')).toHaveClass('bg-success')
    expect(screen.getByText('مكتمل')).toHaveClass('bg-primary')
    expect(screen.getByText('مغلق')).toHaveClass('border-border', 'bg-transparent')
    expect(screen.getAllByText('نشط')).toHaveLength(2)
    expect(screen.getByText('غير نشط')).toHaveClass('border-border', 'bg-transparent')
    expect(screen.getByText('موقوف')).toHaveClass('bg-critical')
  })
})

describe('StatusBadge resilience', () => {
  it('renders a neutral unknown badge with an Arabic label for an unmapped combination', () => {
    render(<StatusBadge entity="asset" status="Draft" />)

    const badge = screen.getByText('غير معروف').closest('[data-slot="badge"]')
    expect(badge).toHaveClass('border-border', 'bg-transparent')
    expect(badge).toHaveAttribute('data-status', 'Draft')
  })

  it('supports explicit label and variant overrides for transient UI states', () => {
    render(
      <StatusBadge entity="document" label="قيد المزامنة" status="Submitted" variant="secondary" />,
    )

    const badge = screen.getByText('قيد المزامنة').closest('[data-slot="badge"]')
    expect(badge).toHaveClass('bg-secondary')
    expect(screen.queryByText('بانتظار الترحيل')).not.toBeInTheDocument()
  })

  it('can hide the confirmation icon', () => {
    const { container } = render(<StatusBadge entity="document" icon={false} status="Posted" />)

    expect(screen.getByText('مرحّل')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="status-badge-icon"]')).not.toBeInTheDocument()
  })
})
