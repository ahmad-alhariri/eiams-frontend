import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  createMaterial,
  createMaterialUnitConversion,
  createUnitOfMeasure,
  fixtureUuid,
} from '@/test/msw/factories'

import { MaterialUnitConversionFormDialog } from './material-unit-conversion-form-dialog'

describe('MaterialUnitConversionFormDialog', () => {
  it('excludes the material base unit and an existing active alternative from a new conversion', async () => {
    const material = createMaterial({
      baseUnit: { id: fixtureUuid(23), displayName: 'قطعة', code: 'EA', status: 'Active' },
    })
    const carton = createUnitOfMeasure({
      unitId: fixtureUuid(26),
      nameAr: 'كرتونة',
      symbolAr: 'كر',
    })

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={null}
        activeFromUnitIds={new Set([carton.unitId])}
        units={[createUnitOfMeasure({ unitId: material.baseUnit.id, nameAr: 'قطعة' }), carton]}
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

  it('only archives a conversion used in posted documents and preserves its factor', async () => {
    const user = userEvent.setup()
    const material = createMaterial()
    const conversion = createMaterialUnitConversion({
      factor: '12',
      usedInPostedDocuments: true,
    })
    const submit = vi.fn().mockResolvedValue(undefined)

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={conversion}
        activeFromUnitIds={new Set()}
        units={[]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={submit}
      />,
    )

    expect(screen.getByRole('textbox', { name: /عامل التحويل/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'أرشفة التحويل' }))

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        fromUnitId: conversion.fromUnit.id,
        factor: '12',
        status: 'Inactive',
      }),
    )
  })

  it('submits a large DECIMAL(18,6) factor exactly as entered', async () => {
    const user = userEvent.setup()
    const material = createMaterial()
    const conversion = createMaterialUnitConversion({ factor: '1' })
    const submit = vi.fn().mockResolvedValue(undefined)

    render(
      <MaterialUnitConversionFormDialog
        open
        material={material}
        conversion={conversion}
        activeFromUnitIds={new Set()}
        units={[]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={submit}
      />,
    )

    const factor = screen.getByRole('textbox', { name: /عامل التحويل/i })
    await user.clear(factor)
    await user.type(factor, '999999999999.000001')
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        fromUnitId: conversion.fromUnit.id,
        factor: '999999999999.000001',
        status: 'Active',
      }),
    )
  })
})
