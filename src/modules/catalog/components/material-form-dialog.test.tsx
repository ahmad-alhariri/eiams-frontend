import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MaterialFormDialog } from '@/modules/catalog/components/material-form-dialog'
import type { Material, MaterialFamily, UnitOfMeasure } from '@/modules/catalog/types/catalog.types'
import { fixtureUuid } from '@/test/msw/factories'

/**
 * Wire-shaped fixtures, minted locally: `catalog-wire-fixtures.ts` still mints
 * the frozen snapshot's records (`materialFamilyId`, `nameAr`, nested
 * `materialFamily`/`unit` references, `rowVersion`) and no longer typechecks
 * against `catalog.api-types`.
 */
function makeFamily(overrides: Partial<MaterialFamily> = {}): MaterialFamily {
  return {
    id: fixtureUuid(21),
    categoryId: fixtureUuid(20),
    code: 'IT-HW',
    name: 'الأجهزة',
    status: 'Active',
    ...overrides,
  }
}

function makeUnit(overrides: Partial<UnitOfMeasure> = {}): UnitOfMeasure {
  return {
    id: fixtureUuid(23),
    name: 'قطعة',
    symbol: 'EA',
    unitType: 'Quantity',
    status: 'Active',
    ...overrides,
  }
}

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: fixtureUuid(60),
    familyId: fixtureUuid(21),
    nameAr: 'حاسوب مكتبي',
    nameEn: 'Desktop Computer',
    code: 'IT-HW-PC-001',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 3,
    attributes: null,
    status: 'Active',
    materialDomainId: fixtureUuid(20),
    materialDomainName: 'تقنية المعلومات',
    baseUnitId: fixtureUuid(23),
    baseUnitSymbol: 'EA',
    ...overrides,
  }
}

/** Fills the two fields the create body binds as required. */
async function fillRequiredFields(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  family: MaterialFamily,
  unit: UnitOfMeasure,
) {
  await user.type(within(dialog).getByLabelText('اسم المادة'), 'حاسوب مكتبي')
  await user.type(within(dialog).getByLabelText('رمز المادة'), 'IT-HW-PC-001')
  await user.type(within(dialog).getByLabelText('اسم المادة بالإنجليزية (اختياري)'), 'Desktop')
  await user.click(within(dialog).getByLabelText('عائلة المادة'))
  await user.click(await screen.findByRole('option', { name: family.name }))
  await user.click(within(dialog).getByLabelText('وحدة القياس الأساسية'))
  await user.click(await screen.findByRole('option', { name: unit.name }))
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
    await fillRequiredFields(user, dialog, family, unit)
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المادة' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // Exactly the members `POST /catalog/materials` binds. `status` is gone —
    // it is a guarded command whose body is an INTEGER ordinal — and so is the
    // retired `descriptionAr`/`nominalConversionFactor` pair, which the create
    // record never bound.
    expect(onSubmit).toHaveBeenCalledWith({
      code: 'IT-HW-PC-001',
      nameAr: 'حاسوب مكتبي',
      nameEn: 'Desktop',
      familyId: family.id,
      baseUnitId: unit.id,
      materialKind: 'Consumable',
      trackingType: 'Quantity',
      hasExpiry: false,
      attributes: null,
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

    const confirmation = await screen.findByRole('alertdialog', {
      name: 'تأكيد تغيير تصنيف المادة',
    })
    expect(within(confirmation).getByText(/سيُعاد ضبط متطلب رقم الأصل/)).toBeInTheDocument()

    await user.click(within(confirmation).getByRole('button', { name: 'تغيير التصنيف' }))

    // The trigger shows the Arabic label for the applied kind, not the raw
    // `Asset` enum value that `Select` used to fall back to.
    await waitFor(() =>
      expect(within(dialog).getByLabelText('نوع المادة')).toHaveTextContent('أصل ثابت'),
    )
    expect(within(dialog).getByLabelText('نوع المادة')).not.toHaveTextContent('Asset')
    // The policy helper under the selector states the custody consequence and
    // the asset-number consequence of the kind currently chosen.
    expect(
      within(dialog).getByText(
        'تُنشأ عهدة إلزامية، ويُسجّل كل أصل في سجل الأصول بمعرّف داخلي للمؤسسة. رقم الأصل: مطلوب (رقم أصل داخلي)',
      ),
    ).toBeInTheDocument()
  })

  it('confirms a tracking-type change too, because it also bumps the catalog version', async () => {
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
    await user.click(within(dialog).getByLabelText('طريقة التتبع'))
    await user.click(await screen.findByRole('option', { name: 'بالتسلسل' }))

    const confirmation = await screen.findByRole('alertdialog', {
      name: 'تأكيد تغيير تصنيف المادة',
    })
    await user.click(within(confirmation).getByRole('button', { name: 'تغيير التصنيف' }))

    await waitFor(() =>
      expect(within(dialog).getByLabelText('طريقة التتبع')).toHaveTextContent('بالتسلسل'),
    )
  })

  it('treats code, family and base unit as create-only and surfaces the catalog version', async () => {
    const user = userEvent.setup()
    const material = makeMaterial()
    const family = makeFamily({ id: material.familyId })
    const unit = makeUnit({ id: material.baseUnitId })
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <MaterialFormDialog
        open
        material={material}
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

    // `familyId`, `baseUnitId` and `code` are absent from the update body, so
    // the form does not pretend they are editable.
    expect(within(dialog).getByLabelText('رمز المادة')).toBeDisabled()
    expect(within(dialog).getByLabelText('عائلة المادة')).toBeDisabled()
    expect(within(dialog).getByLabelText('وحدة القياس الأساسية')).toBeDisabled()

    // The version the update route echoes is shown, not hidden in a tooltip.
    expect(within(dialog).getByText('إصدار الكتالوج')).toBeInTheDocument()
    expect(within(dialog).getByText(String(material.catalogVersion))).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      code: material.code,
      nameAr: material.nameAr,
      nameEn: material.nameEn,
      familyId: material.familyId,
      baseUnitId: material.baseUnitId,
      materialKind: 'Consumable',
      trackingType: 'Quantity',
      hasExpiry: false,
      attributes: null,
    })
  }, 10_000)

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
    await fillRequiredFields(user, dialog, family, unit)
    await user.click(within(dialog).getByRole('button', { name: 'إضافة المادة' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ materialKind: 'Consumable' }))
  }, 10_000)
})
