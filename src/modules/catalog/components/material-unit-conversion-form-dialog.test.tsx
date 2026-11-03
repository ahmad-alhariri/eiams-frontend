import { AxiosError, AxiosHeaders } from 'axios'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MaterialUnitConversionFormDialog } from './material-unit-conversion-form-dialog'
import type {
  Material,
  MaterialUnitConversion,
  UnitOfMeasure,
} from '@/modules/catalog/types/catalog.types'
import { fixtureUuid } from '@/test/msw/factories'

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

function serverError(status: number, code: string, details?: Record<string, unknown>) {
  return new AxiosError('server message', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    data: {
      success: false,
      error: {
        code,
        message: 'server message',
        details: details ?? {},
        request_id: 'req-1',
      },
    },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  })
}

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

describe('MaterialUnitConversionFormDialog server-error contract', () => {
  it('renders a contract field error inline in Arabic', async () => {
    const user = userEvent.setup()
    // Edit mode over a seeded conversion: the create form would reject the click on
    // its own missing from-unit validation, so this asserts the server path alone.
    const onSubmit = vi
      .fn()
      .mockRejectedValue(serverError(400, 'REQUEST_VALIDATION_FAILED', { factor: ['required'] }))
    render(
      <MaterialUnitConversionFormDialog
        open
        material={makeMaterial()}
        conversion={makeConversion()}
        activeUnitIds={new Set()}
        units={[makeUnit()]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.click(screen.getByRole('button', { name: /حفظ/i }))

    const factor = screen.getByLabelText(/عامل التحويل/)
    await waitFor(() => expect(factor).toHaveAttribute('aria-invalid', 'true'))
    const messageId = factor.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(messageId)?.textContent).toBe(
      'تعذر تنفيذ الطلب. راجع البيانات المدخلة.',
    )
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('keeps previous generic-error outcome when no field errors map', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(serverError(500, 'INTERNAL_ERROR'))
    render(
      <MaterialUnitConversionFormDialog
        open
        material={makeMaterial()}
        conversion={makeConversion()}
        activeUnitIds={new Set()}
        units={[makeUnit()]}
        isUnitsLoading={false}
        isUnitsError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.click(screen.getByRole('button', { name: /حفظ/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/عامل التحويل/)).not.toHaveAttribute('aria-invalid')
  })
})
