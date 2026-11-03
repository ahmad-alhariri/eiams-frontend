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
    expect(document.getElementById(messageId)?.textContent).toMatch(/[\u0600-\u06FF]/)
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
