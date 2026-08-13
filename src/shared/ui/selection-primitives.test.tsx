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
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Switch } from '@/shared/ui/switch'

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

describe('Checkbox, RadioGroup, and Switch', () => {
  it('toggle and select with accessible names while exposing token-backed checked states', async () => {
    const user = userEvent.setup()

    render(
      <div dir="rtl">
        <Checkbox aria-label="اختيار المادة" />

        <RadioGroup aria-label="نوع المستلم" defaultValue="employee">
          <label>
            <RadioGroupItem value="employee" />
            موظف
          </label>
          <label>
            <RadioGroupItem value="site" />
            موقع
          </label>
        </RadioGroup>

        <Switch aria-label="تفعيل المستودع" />
      </div>,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'اختيار المادة' })
    const employeeRadio = screen.getByRole('radio', { name: 'موظف' })
    const siteRadio = screen.getByRole('radio', { name: 'موقع' })
    const switchControl = screen.getByRole('switch', { name: 'تفعيل المستودع' })

    expect(employeeRadio).toBeChecked()
    expect(siteRadio).not.toBeChecked()
    expect(checkbox).toHaveClass('focus-visible:ring-2')
    expect(siteRadio).toHaveClass('data-checked:bg-primary')
    expect(switchControl).toHaveClass('data-checked:bg-primary')

    await user.click(checkbox)
    await user.click(siteRadio)
    await user.click(switchControl)

    expect(checkbox).toBeChecked()
    expect(siteRadio).toBeChecked()
    expect(employeeRadio).not.toBeChecked()
    expect(switchControl).toBeChecked()
  })

  it('exposes disabled and invalid semantics without owning business state', async () => {
    const user = userEvent.setup()

    render(
      <>
        <Checkbox aria-label="مادة غير صالحة" aria-invalid disabled />
        <RadioGroup aria-label="حالة الأصل">
          <RadioGroupItem value="active" aria-label="نشط" aria-invalid />
        </RadioGroup>
        <Switch aria-label="خيار مقفل" disabled />
      </>,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'مادة غير صالحة' })
    const radio = screen.getByRole('radio', { name: 'نشط' })
    const switchControl = screen.getByRole('switch', { name: 'خيار مقفل' })

    expect(checkbox).toHaveAttribute('aria-disabled', 'true')
    expect(checkbox).toHaveAttribute('data-disabled')
    expect(checkbox).toHaveAttribute('aria-invalid', 'true')
    expect(checkbox).toHaveClass('aria-invalid:border-destructive')
    expect(radio).toHaveAttribute('aria-invalid', 'true')
    expect(radio).toHaveClass('aria-invalid:ring-2')
    expect(switchControl).toHaveAttribute('aria-disabled', 'true')
    expect(switchControl).toHaveAttribute('data-disabled')

    await user.click(checkbox)
    await user.click(switchControl)

    expect(checkbox).not.toBeChecked()
    expect(switchControl).not.toBeChecked()
  })
})
