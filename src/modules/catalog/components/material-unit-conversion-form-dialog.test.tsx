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

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    materialId: fixtureUuid(60),
    code: 'IT-HW-PC-001',
    nameAr: 'حاسوب',
    descriptionAr: null,
    materialFamilyId: fixtureUuid(22),
    materialFamily: { id: fixtureUuid(22), displayName: 'الحواسيب' },
    materialCategoryId: fixtureUuid(21),
    materialCategory: { id: fixtureUuid(21), displayName: 'الأجهزة' },
    materialDomainId: fixtureUuid(20),
    materialDomain: { id: fixtureUuid(20), displayName: 'تقنية المعلومات' },
    unitId: fixtureUuid(23),
    unit: { id: fixtureUuid(23), displayName: 'قطعة' },
    nominalConversionFactor: 1,
    materialKind: 'Consumable',
    requiresAssetNumber: false,
    status: 'Active',
    rowVersion: 1,
    ...overrides,
  }
}

function makeUnit(overrides: Partial<UnitOfMeasure> = {}): UnitOfMeasure {
  return {
    unitId: fixtureUuid(26),
    code: 'CTN',
    nameAr: 'كرتونة',
    descriptionAr: null,
    nominalConversionFactor: 12,
    baseUnitId: null,
    baseUnit: null,
    status: 'Active',
    rowVersion: 1,
    ...overrides,
  }
}

function makeConversion(overrides: Partial<MaterialUnitConversion> = {}): MaterialUnitConversion {
  return {
    materialUnitConversionId: fixtureUuid(33),
    materialId: fixtureUuid(60),
    material: { id: fixtureUuid(60), displayName: 'حاسوب' },
    unitId: fixtureUuid(26),
    unit: { id: fixtureUuid(26), displayName: 'كرتونة' },
    conversionFactor: 12,
    status: 'Active',
    rowVersion: 1,
    ...overrides,
  }
}

describe('MaterialUnitConversionFormDialog', () => {
  it('excludes the material base unit and an existing active alternative from a new conversion', () => {
    const material = makeMaterial()
    const carton = makeUnit()

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={null}
        activeUnitIds={new Set([carton.unitId])}
        units={[makeUnit({ unitId: material.unit.id, nameAr: 'قطعة' }), carton]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(
      screen.getByText('لا توجد وحدة نشطة متاحة بعد استبعاد وحدة الأساس والتحويلات النشطة.'),
    ).toBeInTheDocument()
  })

  it('submits a positive conversion factor as a number', async () => {
    const user = userEvent.setup()
    const material = makeMaterial()
    const conversion = makeConversion({ conversionFactor: 1 })
    const submit = vi.fn().mockResolvedValue(undefined)

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={conversion}
        activeUnitIds={new Set()}
        units={[]}
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
        unitId: conversion.unit.id,
        conversionFactor: 12,
        status: 'Active',
      }),
    )
  })
})
