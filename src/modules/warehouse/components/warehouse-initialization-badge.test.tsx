import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WarehouseInitializationBadge } from './warehouse-initialization-badge'

describe('WarehouseInitializationBadge', () => {
  it('renders the Arabic "NotInitialized" chip when the warehouse has not been initialized', () => {
    render(<WarehouseInitializationBadge status="NotInitialized" />)
    const badge = screen.getByTestId('warehouse-initialization-badge')
    expect(badge.getAttribute('data-status')).toBe('NotInitialized')
    expect(badge.textContent).toContain('غير مهيأ')
  })

  it('renders the "Initialized with stock" chip with the as-of date when the warehouse was initialized with positive stock', () => {
    render(<WarehouseInitializationBadge status="Initialized" asOfDate="2026-01-01" />)
    const badge = screen.getByTestId('warehouse-initialization-badge')
    expect(badge.getAttribute('data-status')).toBe('Initialized')
    expect(badge.textContent).toContain('مهيأ (بحركة)')
    expect(badge.textContent).toContain('2026-01-01')
  })

  it('renders the "ZeroStock" chip when the warehouse was initialized via the zero-stock path', () => {
    render(<WarehouseInitializationBadge status="ZeroStock" />)
    const badge = screen.getByTestId('warehouse-initialization-badge')
    expect(badge.textContent).toContain('مهيأ (بدون حركة)')
  })

  it('renders the "Reversed" chip when a prior initialization was reversed', () => {
    render(<WarehouseInitializationBadge status="Reversed" />)
    const badge = screen.getByTestId('warehouse-initialization-badge')
    expect(badge.textContent).toContain('معكوس')
  })

  it('renders nothing when the status is missing', () => {
    const { container } = render(<WarehouseInitializationBadge status={null} />)
    expect(container.querySelector('[data-slot="warehouse-initialization-badge"]')).toBeNull()
  })
})
