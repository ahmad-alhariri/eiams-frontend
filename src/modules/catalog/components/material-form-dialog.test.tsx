import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MaterialFormDialog } from '@/modules/catalog/components/material-form-dialog'
import type { MaterialFamily, UnitOfMeasure } from '@/modules/catalog/types/catalog.types'
import { fixtureUuid } from '@/test/msw/factories'

function makeFamily(overrides: Partial<MaterialFamily> = {}): MaterialFamily {
  return {
    materialFamilyId: fixtureUuid(21),
    code: 'IT-HW',
    nameAr: 'الأجهزة',
    parentFamilyId: null,
    parentFamily: null,
    materialCategoryId: fixtureUuid(20),
    materialCategory: { id: fixtureUuid(20), displayName: 'الأجهزة' },
    status: 'Active',
    rowVersion: 1,
    ...overrides,
  }
}

function makeUnit(overrides: Partial<UnitOfMeasure> = {}): UnitOfMeasure {
  return {
    unitId: fixtureUuid(23),
    code: 'EA',
    nameAr: 'قطعة',
    descriptionAr: null,
    nominalConversionFactor: 1,
    baseUnitId: null,
    baseUnit: null,
    status: 'Active',
    rowVersion: 1,
    ...overrides,
  }
}

describe('MaterialFormDialog', () => {
  it('submits the selected contract reference identifiers and all core fields', async () => {
    const user = userEvent.setup()
    const family = makeFamily()
    const unit = makeUnit()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <MaterialFormDialog
        open
        material={null}
        families={[family]}
        units={[unit]}
        isReferencesLoading={false}
        isReferencesError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('اسم المادة'), 'حاسوب مكتبي')
    await user.type(within(dialog).getByLabelText('رمز المادة'), 'IT-HW-PC-001')
    await user.type(within(dialog).getByLabelText('وصف المادة'), 'للاستخدام الإداري')

    await user.click(within(dialog).getByLabelText('عائلة المادة'))
    await user.click(await screen.findByRole('option', { name: family.nameAr }))
    await user.click(within(dialog).getByLabelText('وحدة القياس الأساسية'))
    await user.click(await screen.findByRole('option', { name: unit.nameAr }))
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المادة' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      code: 'IT-HW-PC-001',
      nameAr: 'حاسوب مكتبي',
      descriptionAr: 'للاستخدام الإداري',
      materialFamilyId: family.materialFamilyId,
      unitId: unit.unitId,
      nominalConversionFactor: 1,
      materialKind: 'Consumable',
      status: 'Active',
    })
  }, 10_000)

  it('holds submission when both material references are unavailable and reports a loading error', () => {
    render(
      <MaterialFormDialog
        open
        material={null}
        families={[]}
        units={[]}
        isReferencesLoading={false}
        isReferencesError
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تحميل عائلات المواد أو وحدات القياس')
    expect(screen.getByRole('button', { name: 'إضافة المادة' })).toBeDisabled()
  })

  it('confirms a type change before applying the derived asset tracking policy', async () => {
    const user = userEvent.setup()
    const family = makeFamily()
    const unit = makeUnit()

    render(
      <MaterialFormDialog
        open
        material={null}
        families={[family]}
        units={[unit]}
        isReferencesLoading={false}
        isReferencesError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText('نوع المادة'))
    await user.click(await screen.findByRole('option', { name: 'أصل ثابت' }))

    const confirmation = await screen.findByRole('alertdialog', { name: 'تأكيد تغيير نوع المادة' })
    expect(within(confirmation).getByText(/سيُعاد ضبط متطلب رقم الأصل/)).toBeInTheDocument()

    await user.click(within(confirmation).getByRole('button', { name: 'تغيير النوع' }))

    await waitFor(() => expect(within(dialog).getByLabelText('نوع المادة')).toHaveTextContent('Asset'))
  })

  it('preserves the consumable policy on direct selection', async () => {
    const user = userEvent.setup()
    const family = makeFamily()
    const unit = makeUnit()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <MaterialFormDialog
        open
        material={null}
        families={[family]}
        units={[unit]}
        isReferencesLoading={false}
        isReferencesError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('اسم المادة'), 'حاسوب')
    await user.type(within(dialog).getByLabelText('رمز المادة'), 'IT-HW-001')
    await user.click(within(dialog).getByLabelText('عائلة المادة'))
    await user.click(await screen.findByRole('option', { name: family.nameAr }))
    await user.click(within(dialog).getByLabelText('وحدة القياس الأساسية'))
    await user.click(await screen.findByRole('option', { name: unit.nameAr }))
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المادة' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        materialKind: 'Consumable',
      }),
    )
  })
})
