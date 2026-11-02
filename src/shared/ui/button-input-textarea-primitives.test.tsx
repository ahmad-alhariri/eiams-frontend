import { IconPlus } from '@tabler/icons-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'

describe('Button', () => {
  it('supports keyboard activation and a visible focus treatment', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(<Button onClick={onClick}>حفظ</Button>)

    const button = screen.getByRole('button', { name: 'حفظ' })
    await user.tab()
    expect(button).toHaveFocus()
    expect(button).toHaveClass('focus-visible:ring-2')

    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('exposes token-backed variants and an accessible icon-only size', () => {
    render(
      <>
        <Button variant="outline">إلغاء</Button>
        <Button variant="destructive">حذف</Button>
        <Button variant="ghost" size="icon" aria-label="إضافة مادة">
          <IconPlus />
        </Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'إلغاء' })).toHaveClass(
      'border-primary',
      'text-primary',
    )
    expect(screen.getByRole('button', { name: 'حذف' })).toHaveClass(
      'bg-destructive',
      'text-primary-foreground',
    )
    expect(screen.getByRole('button', { name: 'إضافة مادة' })).toHaveClass('size-9')
  })

  it('retains its label and blocks duplicate activation while loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    const { container } = render(
      <Button loading onClick={onClick}>
        حفظ التغييرات
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'حفظ التغييرات' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveTextContent('حفظ التغييرات')
    expect(container.querySelector('[data-slot="button-loading-icon"]')).toHaveClass(
      'animate-spin',
      'motion-reduce:animate-none',
    )

    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Input and Textarea', () => {
  it('accept Arabic text and inherit an RTL, accessible labeling context', async () => {
    const user = userEvent.setup()

    render(
      <div dir="rtl">
        <label htmlFor="material-name">اسم المادة</label>
        <Input id="material-name" />
        <label htmlFor="notes">ملاحظات</label>
        <Textarea id="notes" />
      </div>,
    )

    const input = screen.getByRole('textbox', { name: 'اسم المادة' })
    const textarea = screen.getByRole('textbox', { name: 'ملاحظات' })

    await user.type(input, 'حاسوب محمول')
    await user.type(textarea, 'عهدة شخصية')

    expect(input).toHaveValue('حاسوب محمول')
    expect(textarea).toHaveValue('عهدة شخصية')
    expect(input).toHaveClass('text-start', 'focus-visible:ring-2')
    expect(textarea).toHaveClass('text-start', 'focus-visible:ring-2')
    expect(input.closest('[dir="rtl"]')).toBeInTheDocument()
  })

  it('exposes native invalid, disabled, and read-only states', async () => {
    const user = userEvent.setup()

    render(
      <>
        <Input aria-label="الرمز" aria-invalid disabled />
        <Textarea aria-label="البيان" defaultValue="بيان ثابت" readOnly />
      </>,
    )

    const input = screen.getByRole('textbox', { name: 'الرمز' })
    const textarea = screen.getByRole('textbox', { name: 'البيان' })

    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveClass('aria-invalid:border-destructive', 'disabled:bg-muted')
    expect(textarea).toHaveAttribute('readonly')
    expect(textarea).toHaveClass('read-only:bg-muted/50')

    await user.type(input, 'M-001')
    await user.type(textarea, ' جديد')
    expect(input).toHaveValue('')
    expect(textarea).toHaveValue('بيان ثابت')
  })

  it('forwards controlled text-entry changes without owning form state', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Input aria-label="البحث" value="" onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: 'البحث' })
    await user.type(input, 'مادة')

    expect(onChange).toHaveBeenCalled()
    expect(input).toHaveValue('')
  })
})
