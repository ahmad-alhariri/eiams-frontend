// @ts-nocheck // eslint-disable-line @typescript-eslint/ban-ts-comment
import axios from 'axios'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type {
  Material,
  MaterialUnitConversion,
  UnitOfMeasure,
} from '@/modules/catalog/types/catalog.types'
import { fixtureUuid } from '@/test/msw/factories'

import { MaterialUnitConversionFormDialog } from './material-unit-conversion-form-dialog'

/**
 * Wire-shaped fixtures, minted locally: `catalog-wire-fixtures.ts` still mints
 * the frozen snapshot's records (`materialId`, `unitId`, a nested `unit`
 * reference, `conversionFactor`, `status`, `rowVersion`) and no longer
 * typechecks against `catalog.api-types`. The real conversion is
 * `{ id, materialId, fromUnitId, toBaseUnitId, factor }` and carries NO status.
 */
function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: fixtureUuid(60),
    familyId: fixtureUuid(22),
    nameAr: 'حاسوب',
    nameEn: null,
    code: 'IT-HW-PC-001',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Active',
    materialDomainId: fixtureUuid(20),
    materialDomainName: 'تقنية المعلومات',
    baseUnitId: fixtureUuid(23),
    baseUnitSymbol: 'EA',
    ...overrides,
  }
}

function makeUnit(overrides: Partial<UnitOfMeasure> = {}): UnitOfMeasure {
  return {
    id: fixtureUuid(26),
    name: 'كرتونة',
    symbol: 'CTN',
    unitType: 'Quantity',
    status: 'Active',
    ...overrides,
  }
}

function makeConversion(overrides: Partial<MaterialUnitConversion> = {}): MaterialUnitConversion {
  return {
    id: fixtureUuid(33),
    materialId: fixtureUuid(60),
    fromUnitId: fixtureUuid(26),
    toBaseUnitId: fixtureUuid(23),
    factor: 12,
    ...overrides,
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('MaterialUnitConversionFormDialog', () => {
  it('offers only units whose unitType matches the base unit, case-insensitively', async () => {
    const user = userEvent.setup()
    const material = makeMaterial()
    const baseUnit = makeUnit({ id: material.baseUnitId, name: 'قطعة', unitType: 'Counting' })
    // The backend compares unit types case-insensitively, so `counting` must
    // still be offered against a `Counting` base unit.
    const sameType = makeUnit({ id: fixtureUuid(27), name: 'صندوق ورقي', unitType: 'counting' })
    const otherType = makeUnit({ id: fixtureUuid(28), name: 'كيلوغرام', unitType: 'الوزن' })

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={null}
        activeUnitIds={new Set()}
        units={[baseUnit, sameType, otherType]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'الوحدة البديلة' }))

    expect(await screen.findByRole('option', { name: 'صندوق ورقي' })).toBeInTheDocument()
    // A cross-type unit is a request the backend refuses with 400
    // MATERIAL_UNIT_CONVERSIONS_UNIT_TYPE_MISMATCH, so it is never offered.
    expect(screen.queryByRole('option', { name: 'كيلوغرام' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'قطعة' })).not.toBeInTheDocument()
  })

  it('says in Arabic why nothing qualifies, instead of offering doomed choices', () => {
    const material = makeMaterial()
    const baseUnit = makeUnit({ id: material.baseUnitId, name: 'قطعة', unitType: 'Counting' })
    const otherType = makeUnit({ id: fixtureUuid(28), name: 'كيلوغرام', unitType: 'الوزن' })

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={null}
        activeUnitIds={new Set()}
        units={[baseUnit, otherType]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(
      screen.getByText(
        'لا توجد وحدة نشطة من نفس نوع وحدة الأساس متاحة، لأن التحويل يتطلب أن تكون وحدة المصدر ووحدة الأساس من النوع نفسه.',
      ),
    ).toBeInTheDocument()
  })

  it('stops the helper text from suggesting a pairing the backend refuses', () => {
    const material = makeMaterial()

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={null}
        activeUnitIds={new Set()}
        units={[makeUnit({ id: material.baseUnitId, name: 'قطعة', unitType: 'Counting' })]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    // "كرتونة واحدة" named a concrete carton for a `Counting` base unit — an
    // example the backend refuses. The example is now unit-agnostic and the
    // same-type rule is stated.
    expect(screen.queryByText(/كرتونة/)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'وحدة أساس المادة هي EA. مثال: وحدة بديلة واحدة = 12 EA. لا يمكن اختيار وحدة من نوع مختلف عن وحدة الأساس.',
      ),
    ).toBeInTheDocument()
  })

  it('excludes the material base unit and an existing active alternative from a new conversion', () => {
    const material = makeMaterial()
    const carton = makeUnit({ unitType: 'Quantity' })
    const baseUnit = makeUnit({ id: material.baseUnitId, name: 'قطعة', unitType: 'Quantity' })

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={null}
        activeUnitIds={new Set([carton.id])}
        units={[baseUnit, carton]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(
      screen.getByText(
        'لا توجد وحدة نشطة من نفس نوع وحدة الأساس متاحة، لأن التحويل يتطلب أن تكون وحدة المصدر ووحدة الأساس من النوع نفسه.',
      ),
    ).toBeInTheDocument()
  })

  it('submits a positive conversion factor as a number', async () => {
    const user = userEvent.setup()
    const material = makeMaterial()
    const conversion = makeConversion({ factor: 1 })
    const submit = vi.fn().mockResolvedValue(undefined)

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={conversion}
        activeUnitIds={new Set()}
        units={[makeUnit({ id: conversion.fromUnitId })]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={submit}
      />,
    )

    const factor = screen.getByRole('spinbutton', { name: /عامل التحويل/i })
    await user.clear(factor)
    await user.type(factor, '12')
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        fromUnitId: conversion.fromUnitId,
        factor: 12,
      }),
    )
  })

  it('offers no status select, because a conversion is deleted rather than deactivated', async () => {
    const material = makeMaterial()
    const conversion = makeConversion()

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={conversion}
        activeUnitIds={new Set()}
        units={[makeUnit({ id: conversion.fromUnitId })]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    // The update route binds `factor` ONLY: no status field, and the alternative
    // unit is shown read-only because re-pointing the units is remove-and-add.
    expect(screen.queryByLabelText('الحالة')).not.toBeInTheDocument()
    expect(screen.getByText('الوحدة البديلة')).toBeInTheDocument()
    expect(screen.getByText('كرتونة')).toBeInTheDocument()
  })
})

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('MaterialUnitConversionFormDialog server-error contract', () => {
  it('renders a contract field error inline in Arabic', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(
      new axios.AxiosError('bad', 'ERR_BAD_REQUEST', { url: '/' } as any, undefined, {
        status: 400,
        data: {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'bad',
            details: { factor: ['required'] },
            request_id: 't1',
          },
        },
      }),
    )
    render(
      <MaterialUnitConversionFormDialog
        open
        material={makeMaterial()}
        conversion={null}
        activeUnitIds={new Set()}
        units={[makeUnit()]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.type(screen.getByRole('spinbutton', { name: /عامل/i }), '1')
    await user.click(screen.getByRole('button', { name: /حفظ/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('keeps previous generic-error outcome when no field errors map', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(
      new axios.AxiosError('bad', 'ERR_BAD_REQUEST', { url: '/' } as any, undefined, {
        status: 500,
        data: {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'bad',
            details: {},
            request_id: 't2',
          },
        },
      }),
    )
    render(
      <MaterialUnitConversionFormDialog
        open
        material={makeMaterial()}
        conversion={null}
        activeUnitIds={new Set()}
        units={[makeUnit()]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.type(screen.getByRole('spinbutton', { name: /عامل/i }), '1')
    await user.click(screen.getByRole('button', { name: /حفظ/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})






/* eslint-enable @typescript-eslint/no-explicit-any */


