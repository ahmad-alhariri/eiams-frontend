import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import UnitsOfMeasurePage from '@/modules/catalog/pages/units-of-measure-page'
import { createQueryClient } from '@/shared/services/query.client'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { fixtureUuid } from '@/test/msw/factories'
import type { UnitOfMeasure } from '@/modules/catalog/types/catalog.types'

const scope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: scope.key }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'catalog.manage' && permissions.canManage,
  }),
}))

const API_BASE_URL = '/api/v1'

/**
 * Wire-shaped fixture, minted locally: `catalog-wire-fixtures.ts` still mints
 * the frozen snapshot's record (`unitId`, `code`, `nameAr`,
 * `nominalConversionFactor`, `rowVersion`) and no longer typechecks against
 * `catalog.api-types`. The real projection is
 * `{ id, name, symbol, unitType, status }`.
 */
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

function PageWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
}

describe('UnitsOfMeasurePage', () => {
  it('paginates server-side from page 1 and reaches rows past the default page size', async () => {
    const receivedPages: Array<string | null> = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, ({ request }) => {
        const params = new URL(request.url).searchParams
        receivedPages.push(params.get('page'))
        const page = Number(params.get('page') ?? '1')
        const names = Array.from(
          { length: page === 2 ? 3 : 10 },
          (_, index) => `وحدة ${page}-${index + 1}`,
        )

        return okPageJson(
          names.map((name, index) => makeUnit({ id: fixtureUuid(70 + page * 10 + index), name })),
          { page, pageSize: 10, totalCount: 13, totalPages: 2 },
        )
      }),
    )

    render(<UnitsOfMeasurePage />, { wrapper: PageWrapper })

    const pager = await screen.findByRole('navigation', { name: 'تنقل بين الصفحات' })
    // `useServerPagination` and the wire are both one-based: `page=0` is a 400.
    expect(receivedPages[0]).toBe('1')
    expect(await within(pager).findByText('صفحة ١ من ٢')).toBeInTheDocument()
    expect(within(pager).getByText('عرض ١–١٠ من ١٣')).toBeInTheDocument()

    await user.click(within(pager).getByRole('button', { name: 'الصفحة التالية' }))

    await waitFor(() => expect(receivedPages.at(-1)).toBe('2'))
    expect(await screen.findByText('وحدة 2-1')).toBeInTheDocument()
    expect(within(pager).getByText('عرض ١١–١٣ من ١٣')).toBeInTheDocument()
  })

  it('lists active and inactive contract records and hides write actions without catalog.manage', async () => {
    permissions.canManage = false
    const activeUnit = makeUnit({ name: 'قطعة', symbol: 'EA', status: 'Active' })
    const inactiveUnit = makeUnit({
      id: fixtureUuid(24),
      name: 'صندوق',
      symbol: 'BOX',
      status: 'Inactive',
    })
    server.use(
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () =>
        okPageJson([activeUnit, inactiveUnit]),
      ),
    )

    render(<UnitsOfMeasurePage />, { wrapper: PageWrapper })

    await waitFor(() => expect(screen.getByText('صندوق')).toBeInTheDocument())
    expect(screen.getAllByText('قطعة').length).toBeGreaterThan(0)
    // A unit carries a free-form `symbol`, not the retired
    // `nominalConversionFactor` the snapshot described: the conversion story
    // lives on the material.
    expect(screen.getByText('EA')).toBeInTheDocument()
    expect(screen.getByText('BOX')).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(screen.getByText('غير نشط')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة وحدة قياس' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعطيل/ })).not.toBeInTheDocument()
  })

  it('sends an exact contract create request for catalog managers', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    let requestBody: unknown
    server.use(
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
      http.post(`${API_BASE_URL}/catalog/units-of-measure`, async ({ request }) => {
        requestBody = await request.json()
        return okJson(makeUnit({ name: 'صندوق', symbol: 'BOX' }))
      }),
    )

    render(<UnitsOfMeasurePage />, { wrapper: PageWrapper })

    const createButton = await screen.findByRole('button', { name: 'إضافة وحدة قياس' })
    await user.click(createButton)
    await user.type(screen.getByLabelText('اسم الوحدة'), ' صندوق ')
    await user.type(screen.getByLabelText('رمز الوحدة'), ' BOX ')
    await user.type(screen.getByLabelText('نوع الوحدة'), ' Quantity ')
    await user.click(screen.getByRole('button', { name: 'إضافة الوحدة' }))

    await waitFor(() =>
      // All three members are `[JsonRequired]` and there is nothing else: no
      // `status` (a separate guarded command), no `code`, no `descriptionAr`,
      // no conversion factor, no version.
      expect(requestBody).toEqual({
        name: 'صندوق',
        symbol: 'BOX',
        unitType: 'Quantity',
      }),
    )
  })

  it('deactivates through the integer status command', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const unit = makeUnit()
    const statusBodies: unknown[] = []
    server.use(
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([unit])),
      http.put(
        `${API_BASE_URL}/catalog/units-of-measure/${unit.id}/status`,
        async ({ request }) => {
          statusBodies.push(await request.json())
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    render(<UnitsOfMeasurePage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: `تعطيل ${unit.name}` }))
    const confirmation = await screen.findByRole('alertdialog')
    await user.click(within(confirmation).getByRole('button', { name: 'تعطيل الوحدة' }))

    await waitFor(() => expect(statusBodies).toEqual([{ status: 1 }]))
  })
})
