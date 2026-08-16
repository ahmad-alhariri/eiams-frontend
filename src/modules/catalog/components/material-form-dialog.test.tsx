import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MaterialFormDialog } from '@/modules/catalog/components/material-form-dialog'
import { createMaterialFamily, createUnitOfMeasure } from '@/test/msw/factories'

describe('MaterialFormDialog', () => {
  it('submits the selected contract reference identifiers and all core fields', async () => {
    const user = userEvent.setup()
    const family = createMaterialFamily()
    const unit = createUnitOfMeasure()
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
      baseUnitId: unit.unitId,
      code: 'IT-HW-PC-001',
      descriptionAr: 'للاستخدام الإداري',
      familyId: family.familyId,
      materialKind: 'Consumable',
      nameAr: 'حاسوب مكتبي',
      requiresAssetNumber: false,
      status: 'Active',
      trackingType: 'Quantity',
    })
  })

  it('holds submission until both material references are available and reports a loading error', async () => {
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'تعذّر تحميل عائلات المواد أو وحدات القياس',
    )
    expect(screen.getByRole('button', { name: 'إضافة المادة' })).toBeDisabled()
  })

  it('confirms a type change before applying the derived asset tracking policy', async () => {
    const user = userEvent.setup()
    const family = createMaterialFamily()
    const unit = createUnitOfMeasure()

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
    expect(within(confirmation).getByText(/سيُعاد ضبط أسلوب التتبع/)).toBeInTheDocument()
    expect(within(dialog).getByText('غير مطلوب')).toBeInTheDocument()

    await user.click(within(confirmation).getByRole('button', { name: 'تغيير النوع' }))

    await waitFor(() => expect(within(dialog).getByText('مطلوب')).toBeInTheDocument())
    expect(within(dialog).getByLabelText('أسلوب التتبع')).toBeDisabled()
    expect(
      within(dialog).getByText('الأصل الثابت يتطلب رقم أصل داخلياً، ويُتبع بالرقم التسلسلي.'),
    ).toBeInTheDocument()
  })

  it('allows serial tracking for a durable item without enabling an asset number', async () => {
    const user = userEvent.setup()
    const family = createMaterialFamily()
    const unit = createUnitOfMeasure()
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
    await user.type(within(dialog).getByLabelText('اسم المادة'), 'خرازة')
    await user.type(within(dialog).getByLabelText('رمز المادة'), 'TOOLS-001')
    await user.click(within(dialog).getByLabelText('عائلة المادة'))
    await user.click(await screen.findByRole('option', { name: family.nameAr }))
    await user.click(within(dialog).getByLabelText('وحدة القياس الأساسية'))
    await user.click(await screen.findByRole('option', { name: unit.nameAr }))
    await user.click(within(dialog).getByLabelText('نوع المادة'))
    await user.click(await screen.findByRole('option', { name: 'عهدة تشغيلية' }))
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'تأكيد تغيير نوع المادة' })).getByRole(
        'button',
        { name: 'تغيير النوع' },
      ),
    )
    await user.click(within(dialog).getByLabelText('أسلوب التتبع'))
    await user.click(await screen.findByRole('option', { name: 'بالرقم التسلسلي' }))
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المادة' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        materialKind: 'Durable',
        trackingType: 'Serial',
        requiresAssetNumber: false,
      }),
    )
  })
})
