import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InventoryLowStockBadge } from './inventory-low-stock-badge'

describe('InventoryLowStockBadge', () => {
  it.each([
    [0, 'Low', 0, 'منخفض', 'حدّ التنبيه: ٠'],
    [1, 'Sufficient', 3.125, 'الرصيد كافٍ', 'حدّ التنبيه: ٣٫١٢٥'],
  ] as const)(
    'renders the server-provided configured threshold for %s',
    (state, name, threshold, label, detail) => {
      const { container } = render(
        <InventoryLowStockBadge state={state} thresholdQuantity={threshold} />,
      )

      expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getByLabelText(detail)).toBeInTheDocument()
      expect(container.querySelector('[data-slot="inventory-low-stock"]')).toHaveAttribute(
        'data-low-stock-state',
        name,
      )
    },
  )

  it.each([
    [2, 'NotConfigured', 'حدّ التنبيه غير محدد'],
    [3, 'Disabled', 'تنبيه الانخفاض معطّل'],
  ] as const)('renders %s without inventing a null threshold', (state, name, label) => {
    const { container } = render(<InventoryLowStockBadge state={state} thresholdQuantity={null} />)

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(container.querySelector('[data-slot="inventory-low-stock"]')).toHaveAttribute(
      'data-low-stock-state',
      name,
    )
    expect(container.querySelector('[data-slot="inventory-low-stock-threshold"]')).toBeNull()
  })

  it('renders a neutral fallback for a wire code outside 0..3', () => {
    const { container } = render(<InventoryLowStockBadge state={9} thresholdQuantity={5} />)

    expect(screen.getByText('حالة غير معروفة')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="inventory-low-stock"]')).toHaveAttribute(
      'data-low-stock-state',
      'Unknown',
    )
    expect(container.querySelector('[data-slot="inventory-low-stock-threshold"]')).toBeNull()
  })
})
