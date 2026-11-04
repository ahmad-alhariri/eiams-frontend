import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Checkbox } from '@/shared/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

describe('Select', () => {
  it('supports accessible RTL selection and EIAMS focus/dropdown styling', async () => {
    const user = userEvent.setup()

    render(
      <div dir="rtl">
        <Select defaultValue="المستودع الرئيسي">
          <SelectTrigger aria-label="المستودع">
            <SelectValue placeholder="اختر المستودع" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>المستودعات</SelectLabel>
              <SelectItem value="المستودع الرئيسي">المستودع الرئيسي</SelectItem>
              <SelectItem value="مستودع الأصول">مستودع الأصول</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>,
    )

    const trigger = screen.getByRole('combobox', { name: 'المستودع' })
    expect(trigger).toHaveTextContent('المستودع الرئيسي')
    expect(trigger).toHaveAttribute('data-size', 'default')
    expect(trigger).toHaveClass('text-start', 'focus-visible:ring-2')
    expect(trigger.closest('[dir="rtl"]')).toBeInTheDocument()

    await user.click(trigger)

    const option = await screen.findByRole('option', { name: 'مستودع الأصول' })
    expect(option).toHaveClass('border-s-2', 'pe-8', 'ps-2')
    expect(document.querySelector('[data-slot="select-content"]')).toHaveClass(
      'shadow-dropdown',
      'rounded-lg',
    )

    await user.click(option)
    expect(trigger).toHaveTextContent('مستودع الأصول')
  })
})

describe('Checkbox', () => {
  it('toggle and select with accessible names while exposing token-backed checked states', async () => {
    const user = userEvent.setup()

    render(
      <div dir="rtl">
        <Checkbox aria-label="اختيار المادة" />
      </div>,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'اختيار المادة' })

    expect(checkbox).toHaveClass('focus-visible:ring-2')

    await user.click(checkbox)

    expect(checkbox).toBeChecked()
  })

  it('exposes disabled and invalid semantics without owning business state', async () => {
    const user = userEvent.setup()

    render(
      <>
        <Checkbox aria-label="مادة غير صالحة" aria-invalid disabled />
      </>,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'مادة غير صالحة' })

    expect(checkbox).toHaveAttribute('aria-disabled', 'true')
    expect(checkbox).toHaveAttribute('data-disabled')
    expect(checkbox).toHaveAttribute('aria-invalid', 'true')
    expect(checkbox).toHaveClass('aria-invalid:border-destructive')

    await user.click(checkbox)

    expect(checkbox).not.toBeChecked()
  })
})
