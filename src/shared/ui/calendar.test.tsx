import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { Calendar } from '@/shared/ui/calendar'

describe('Calendar primitive', () => {
  it('renders the Arabic month header and weekday row starting on Saturday', () => {
    render(<Calendar defaultMonth={new Date(2026, 7, 1)} value={new Date(2026, 7, 15)} />)

    expect(screen.getByText('أغسطس 2026')).toBeInTheDocument()
    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((cell) => cell.textContent)).toEqual([
      'سبت',
      'أحد',
      'إثنين',
      'ثلاثاء',
      'أربعاء',
      'خميس',
      'جمعة',
    ])
    expect(headers[0]).toHaveAttribute('aria-label', 'السبت')

    expect(screen.getByRole('button', { name: 'الشهر السابق' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'الشهر التالي' })).toBeInTheDocument()
  })

  it('selects a day and marks it as selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<Calendar value={new Date(2026, 7, 1)} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '15 أغسطس 2026' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 7, 15))

    rerender(<Calendar value={new Date(2026, 7, 15)} onChange={onChange} />)
    const cell = screen.getByRole('button', { name: '15 أغسطس 2026' }).closest('[role="gridcell"]')
    expect(cell).toHaveAttribute('aria-selected', 'true')
  })

  it('retains an uncontrolled selection and starts roving focus inside the displayed month', async () => {
    const user = userEvent.setup()
    render(<Calendar defaultMonth={new Date(2027, 3, 1)} defaultValue={new Date(2027, 3, 15)} />)

    const selectedDay = screen.getByRole('button', { name: '15 أبريل 2027' })
    expect(selectedDay.closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true')
    expect(selectedDay).toHaveAttribute('tabindex', '0')

    await user.click(screen.getByRole('button', { name: '20 أبريل 2027' }))

    expect(
      screen.getByRole('button', { name: '20 أبريل 2027' }).closest('[role="gridcell"]'),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('navigates between months with the caption controls', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    render(<Calendar defaultMonth={new Date(2026, 7, 1)} onMonthChange={onMonthChange} />)

    await user.click(screen.getByRole('button', { name: 'الشهر السابق' }))
    expect(screen.getByText('يوليو 2026')).toBeInTheDocument()
    expect(onMonthChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 6, 1))

    await user.click(screen.getByRole('button', { name: 'الشهر التالي' }))
    await user.click(screen.getByRole('button', { name: 'الشهر التالي' }))
    expect(screen.getByText('سبتمبر 2026')).toBeInTheDocument()
  })

  it('moves focus with arrow, home, end and page keys', async () => {
    const user = userEvent.setup()
    render(<Calendar defaultValue={new Date(2026, 7, 15)} />)

    const focusedDay = screen.getByRole('button', { name: '15 أغسطس 2026' })
    focusedDay.focus()
    expect(focusedDay).toHaveAttribute('tabindex', '0')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: '16 أغسطس 2026' })).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: '15 أغسطس 2026' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: '22 أغسطس 2026' })).toHaveFocus()

    await user.keyboard('{PageUp}')
    expect(screen.getByRole('button', { name: '1 أغسطس 2026' })).toHaveFocus()

    await user.keyboard('{Home}')
    expect(screen.getByRole('button', { name: '1 أغسطس 2026' })).toHaveFocus()

    await user.keyboard('{End}')
    expect(screen.getByRole('button', { name: '31 أغسطس 2026' })).toHaveFocus()

    await user.keyboard('{PageDown}')
    expect(screen.getByRole('button', { name: '11 سبتمبر 2026' })).toHaveFocus()
  })

  it('selects the focused day with Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Calendar defaultValue={new Date(2026, 7, 15)} onChange={onChange} />)

    screen.getByRole('button', { name: '15 أغسطس 2026' }).focus()
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 7, 15))
  })

  it('disables out-of-range days while keeping in-range days enabled', () => {
    render(
      <Calendar
        defaultMonth={new Date(2026, 1, 1)}
        min={new Date(2026, 1, 20)}
        max={new Date(2026, 1, 25)}
      />,
    )

    expect(screen.getByRole('button', { name: '19 فبراير 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '20 فبراير 2026' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '25 فبراير 2026' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '26 فبراير 2026' })).toBeDisabled()
  })

  it('renders outside days muted and lets clicks navigate the month', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Calendar defaultMonth={new Date(2026, 1, 1)} onChange={onChange} />)

    const outsideDay = screen.getByRole('button', { name: '31 يناير 2026' })
    expect(outsideDay.closest('[role="gridcell"]')).toHaveAttribute('data-outside')
    expect(outsideDay).toHaveClass('text-popover-foreground/40')

    await user.click(outsideDay)

    expect(onChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 0, 31))
    expect(screen.getByText('يناير 2026')).toBeInTheDocument()
  })

  it('disables month navigation at the min boundary', () => {
    render(
      <Calendar
        defaultMonth={new Date(2026, 1, 1)}
        min={new Date(2026, 1, 20)}
        max={new Date(2026, 3, 10)}
      />,
    )

    expect(screen.getByRole('button', { name: 'الشهر السابق' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'الشهر التالي' })).toBeEnabled()
  })
})
