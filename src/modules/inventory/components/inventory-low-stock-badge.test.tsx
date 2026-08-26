import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InventoryLowStockBadge } from './inventory-low-stock-badge'

describe('InventoryLowStockBadge', () => {
  it.each([
    ['Low', 0, 'منخفض', 'حدّ التنبيه: ٠'],
    ['Sufficient', 3.125, 'الرصيد كافٍ', 'حدّ التنبيه: ٣٫١٢٥'],
  ] as const)(
    'renders the server-provided configured threshold for %s',
    (state, threshold, label, detail) => {
      render(<InventoryLowStockBadge state={state} thresholdQuantity={threshold} />)

      expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getByLabelText(detail)).toBeInTheDocument()
    },
  )

  it.each([
    ['NotConfigured', 'حدّ التنبيه غير محدد'],
    ['Disabled', 'تنبيه الانخفاض معطّل'],
  ] as const)('renders %s without inventing a null threshold', (state, label) => {
    const { container } = render(<InventoryLowStockBadge state={state} thresholdQuantity={null} />)

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(container.querySelector('[data-slot="inventory-low-stock-threshold"]')).toBeNull()
  })
})
