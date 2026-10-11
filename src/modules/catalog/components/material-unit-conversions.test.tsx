import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { MaterialUnitConversions } from '@/modules/catalog/components/material-unit-conversions'
import { errJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { fixtureUuid } from '@/test/msw/factories'
import type {
  Material,
  MaterialUnitConversion,
  UnitOfMeasure,
} from '@/modules/catalog/types/catalog.types'

const API_BASE_URL = '/api/v1'

const MATERIAL_ID = fixtureUuid(60)
const BASE_UNIT_ID = fixtureUuid(23)
const CARTON_UNIT_ID = fixtureUuid(26)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' as const } }),
}))
vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({ has: () => true }),
}))
vi.mock('@/shared/ui/toast-manager', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

function makeMaterial(): Material {
  return {
    id: MATERIAL_ID,
    familyId: fixtureUuid(22),
    nameAr: 'حاسوب مكتبي',
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
    baseUnitId: BASE_UNIT_ID,
    baseUnitSymbol: 'EA',
  }
}

function makeUnit(id: string, name: string): UnitOfMeasure {
  return {
    id,
    name,
    symbol: name.slice(0, 3).toUpperCase(),
    unitType: 'Quantity',
    status: 'Active',
  }
}

function makeConversion(id: string): MaterialUnitConversion {
  return {
    id,
    materialId: MATERIAL_ID,
    fromUnitId: CARTON_UNIT_ID,
    toBaseUnitId: BASE_UNIT_ID,
    factor: 12,
  }
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('MaterialUnitConversions', () => {
  it('renders the flat wire shape: resolved unit label and numeric factor', async () => {
    const material = makeMaterial()
    const conversion = makeConversion(fixtureUuid(33))
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}/unit-conversions`, () =>
        okPageJson([conversion]),
      ),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () =>
        okPageJson([makeUnit(BASE_UNIT_ID, 'قطعة'), makeUnit(CARTON_UNIT_ID, 'كرتونة')]),
      ),
    )

    render(<MaterialUnitConversions material={material} />, { wrapper: createWrapper() })

    expect(await screen.findByText('كرتونة')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    // A conversion carries no status, so the old "الحالة" column is gone: the
    // lifecycle is DELETE, not a status change no route serves.
    expect(screen.queryByRole('columnheader', { name: 'الحالة' })).not.toBeInTheDocument()
  })

  it('removes a conversion through the DELETE route after an Arabic confirmation', async () => {
    const material = makeMaterial()
    const conversion = makeConversion(fixtureUuid(33))
    const methods: string[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}/unit-conversions`, () =>
        okPageJson([conversion]),
      ),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () =>
        okPageJson([makeUnit(CARTON_UNIT_ID, 'كرتونة')]),
      ),
      http.delete(
        `${API_BASE_URL}/catalog/materials/${MATERIAL_ID}/unit-conversions/${conversion.id}`,
        () => {
          methods.push('DELETE')
          return new HttpResponse(null, { status: 204 })
        },
      ),
      http.put(
        `${API_BASE_URL}/catalog/materials/:materialId/unit-conversions/:conversionId`,
        () => {
          methods.push('PUT')
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    render(<MaterialUnitConversions material={material} />, { wrapper: createWrapper() })

    await user.click(await screen.findByRole('button', { name: 'إزالة التحويل كرتونة' }))
    const confirmation = await screen.findByRole('alertdialog', { name: 'إزالة وحدة بديلة' })
    await user.click(within(confirmation).getByRole('button', { name: 'إزالة التحويل' }))

    await waitFor(() => expect(methods).toEqual(['DELETE']))
  })

  it('leaves the row in place when the server refuses the removal', async () => {
    const material = makeMaterial()
    const conversion = makeConversion(fixtureUuid(33))
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}/unit-conversions`, () =>
        okPageJson([conversion]),
      ),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () =>
        okPageJson([makeUnit(CARTON_UNIT_ID, 'كرتونة')]),
      ),
      http.delete(
        `${API_BASE_URL}/catalog/materials/${MATERIAL_ID}/unit-conversions/${conversion.id}`,
        () => errJson(409, { code: 'CONFLICT', message: 'refused' }),
      ),
    )

    render(<MaterialUnitConversions material={material} />, { wrapper: createWrapper() })

    await user.click(await screen.findByRole('button', { name: 'إزالة التحويل كرتونة' }))
    await user.click(await screen.findByRole('button', { name: 'إزالة التحويل' }))

    // Nothing about the row is assumed to have changed, and the confirm dialog
    // does not claim a success it did not get.
    await waitFor(() => expect(screen.getByText('كرتونة')).toBeInTheDocument())
  })
})
