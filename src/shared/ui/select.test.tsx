import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

/**
 * A closed `Select` trigger can only show a meaningful label if `Select.Root`
 * receives the item label map (`items`). Rendered `SelectItem` children live in
 * a portalled popup that is unmounted while closed, so Base UI cannot read the
 * label back from them and falls back to serializing the raw value.
 */
describe('Select closed-trigger label resolution', () => {
  it('shows the Arabic item label instead of the raw value', () => {
    render(
      <div dir="rtl">
        <Select value="all">
          <SelectTrigger aria-label="تصفية حسب العائلة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل العائلات</SelectItem>
            <SelectItem value="family-1">أدوات بناء</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    )

    const trigger = screen.getByRole('combobox', { name: 'تصفية حسب العائلة' })
    expect(trigger).toHaveTextContent('كل العائلات')
    expect(trigger).not.toHaveTextContent('all')
  })

  it('resolves the label of a selected domain value rather than its identifier', () => {
    render(
      <div dir="rtl">
        <Select value="family-1">
          <SelectTrigger aria-label="تصفية حسب العائلة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل العائلات</SelectItem>
            <SelectItem value="family-1">أدوات بناء</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    )

    expect(screen.getByRole('combobox', { name: 'تصفية حسب العائلة' })).toHaveTextContent(
      'أدوات بناء',
    )
  })

  it('resolves labels declared inside a select group', () => {
    render(
      <div dir="rtl">
        <Select defaultValue="Active">
          <SelectTrigger aria-label="تصفية حسب الحالة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>الحالات</SelectLabel>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="Active">نشط</SelectItem>
              <SelectItem value="Inactive">غير نشط</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>,
    )

    expect(screen.getByRole('combobox', { name: 'تصفية حسب الحالة' })).toHaveTextContent('نشط')
  })

  it('re-labels the trigger when the selection changes', async () => {
    const user = userEvent.setup()

    render(
      <div dir="rtl">
        <Select defaultValue="all">
          <SelectTrigger aria-label="تصفية حسب الحالة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="Active">نشط</SelectItem>
            <SelectItem value="Inactive">غير نشط</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    )

    const trigger = screen.getByRole('combobox', { name: 'تصفية حسب الحالة' })
    expect(trigger).toHaveTextContent('كل الحالات')

    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    expect(trigger).toHaveTextContent('غير نشط')
    expect(trigger).not.toHaveTextContent('Inactive')
  })

  it('keeps the placeholder while nothing is selected', () => {
    render(
      <div dir="rtl">
        <Select value="">
          <SelectTrigger aria-label="الموقع">
            <SelectValue placeholder="اختر الموقع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">اختر الموقع</SelectItem>
            <SelectItem value="site-1">موقع دمشق</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    )

    expect(screen.getByRole('combobox', { name: 'الموقع' })).toHaveTextContent('اختر الموقع')
  })

  it('leaves an explicit SelectValue child label untouched', () => {
    render(
      <div dir="rtl">
        <Select value="Active">
          <SelectTrigger aria-label="تصفية حسب حالة المجال">
            <SelectValue>نشط</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="Active">نشط</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    )

    expect(screen.getByRole('combobox', { name: 'تصفية حسب حالة المجال' })).toHaveTextContent('نشط')
  })

  it('lets an explicit items map win over labels derived from children', () => {
    render(
      <div dir="rtl">
        <Select value="10" items={{ '10': 'عرض ١٠ صفاً' }}>
          <SelectTrigger aria-label="عدد الصفوف في الصفحة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    )

    expect(screen.getByRole('combobox', { name: 'عدد الصفوف في الصفحة' })).toHaveTextContent(
      'عرض ١٠ صفاً',
    )
  })
})
