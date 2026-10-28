import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { Button } from '@/shared/ui/button'
import { DatePicker } from '@/shared/ui/date-picker'

describe('DatePicker primitive', () => {
  it('shows the Arabic placeholder when no date is selected', () => {
    render(<DatePicker />)

    expect(screen.getByRole('button', { name: 'اختر التاريخ' })).toHaveTextContent('اختر التاريخ')
  })

  it('shows the selected date in Arabic', () => {
    render(<DatePicker value={new Date(2026, 7, 15)} />)

    const trigger = screen.getByRole('button', { name: 'التاريخ المحدد: 15 أغسطس 2026' })
    expect(trigger).toHaveTextContent('15 أغسطس 2026')
  })

  it('names the control explicitly when several pickers share a form', () => {
    const { rerender } = render(<DatePicker ariaLabel="من تاريخ الترحيل" />)

    expect(screen.getByRole('button', { name: 'من تاريخ الترحيل' })).toBeInTheDocument()

    rerender(<DatePicker ariaLabel="من تاريخ الترحيل" value={new Date(2026, 7, 15)} />)
    expect(
      screen.getByRole('button', { name: 'من تاريخ الترحيل: 15 أغسطس 2026' }),
    ).toBeInTheDocument()
  })

  it('opens the calendar popup and selects a day', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DatePicker value={new Date(2026, 7, 1)} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'التاريخ المحدد: 1 أغسطس 2026' }))

    const calendar = screen.getByRole('grid')
    expect(calendar).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '20 أغسطس 2026' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 7, 20))
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('clears the selected date through the clear control', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<DatePicker value={new Date(2026, 7, 15)} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'مسح التاريخ' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined)
    rerender(<DatePicker onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'اختر التاريخ' })).toBeInTheDocument()
  })

  it('clears an uncontrolled picker back to the placeholder', async () => {
    const user = userEvent.setup()
    render(<DatePicker defaultValue={new Date(2026, 7, 15)} />)

    expect(screen.getByText('15 أغسطس 2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'مسح التاريخ' }))

    expect(screen.getByRole('button', { name: 'اختر التاريخ' })).toHaveTextContent('اختر التاريخ')
  })

  it('retains a newly selected date when used without a controlled value', async () => {
    const user = userEvent.setup()
    render(<DatePicker defaultValue={new Date(2026, 7, 1)} />)

    await user.click(screen.getByRole('button', { name: 'التاريخ المحدد: 1 أغسطس 2026' }))
    await user.click(screen.getByRole('button', { name: '20 أغسطس 2026' }))

    expect(
      screen.getByRole('button', { name: 'التاريخ المحدد: 20 أغسطس 2026' }),
    ).toBeInTheDocument()
  })

  it('does not open when disabled', async () => {
    const user = userEvent.setup()
    render(<DatePicker value={new Date(2026, 7, 15)} disabled />)

    const trigger = screen.getByRole('button', { name: 'التاريخ المحدد: 15 أغسطس 2026' })
    expect(trigger).toBeDisabled()

    await user.click(trigger)
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('closes the calendar popup on Escape', async () => {
    const user = userEvent.setup()
    render(<DatePicker />)

    await user.click(screen.getByRole('button', { name: 'اختر التاريخ' }))
    expect(screen.getByRole('grid')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })
})

/**
 * Regression (live Browser QA, 2026-10-26): replacing the native
 * `<input type="date">` with `DatePicker` dropped the id / aria props that
 * `FormControl` clones onto its child, so `FormLabel`'s `htmlFor` pointed at no
 * element and an invalid field was no longer announced as invalid.
 */
function RequiredDateHarness() {
  const form = useForm<{ asOfDate: string }>({
    resolver: zodResolver(z.object({ asOfDate: z.string().min(1, 'تاريخ الرصيد مطلوب.') })),
    defaultValues: { asOfDate: '' },
  })
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => undefined)} noValidate>
        <FormField
          control={form.control}
          name="asOfDate"
          render={() => (
            <FormItem>
              <FormLabel>تاريخ الرصيد الافتتاحي</FormLabel>
              <FormControl>
                <DatePicker ariaLabel="تاريخ الرصيد الافتتاحي" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">حفظ</Button>
      </form>
    </Form>
  )
}

describe('DatePicker inside the shared Form primitives', () => {
  it('lends the FormItem id to its trigger so the FormLabel htmlFor resolves', () => {
    render(<RequiredDateHarness />)

    const trigger = screen.getByRole('button', { name: 'تاريخ الرصيد الافتتاحي' })

    expect(trigger.id).not.toBe('')
    expect(screen.getByText('تاريخ الرصيد الافتتاحي')).toHaveAttribute('for', trigger.id)
  })

  it('announces an invalid field through aria-invalid and aria-describedby', async () => {
    const user = userEvent.setup()
    render(<RequiredDateHarness />)

    const trigger = screen.getByRole('button', { name: 'تاريخ الرصيد الافتتاحي' })
    expect(trigger).not.toHaveAttribute('aria-invalid')

    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    const message = await screen.findByText('تاريخ الرصيد مطلوب.')
    await waitFor(() => expect(trigger).toHaveAttribute('aria-invalid', 'true'))
    expect(trigger).toHaveAttribute('aria-describedby', message.id)
  })
})
