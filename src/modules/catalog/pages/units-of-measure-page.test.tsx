import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import UnitsOfMeasurePage from '@/modules/catalog/pages/units-of-measure-page'
import { createQueryClient } from '@/shared/services/query.client'
import { createUnitOfMeasure } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

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

function PageWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
}

describe('UnitsOfMeasurePage', () => {
  it('lists active and inactive contract records and hides write actions without catalog.manage', async () => {
    permissions.canManage = false
    const activeUnit = createUnitOfMeasure({ nameAr: 'قطعة', symbolAr: 'قط', status: 'Active' })
    const inactiveUnit = createUnitOfMeasure({
      unitId: '00000000-0000-4000-8000-000000000024',
      nameAr: 'صندوق',
      status: 'Inactive',
    })
    server.use(
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () =>
        HttpResponse.json([activeUnit, inactiveUnit]),
      ),
    )

    render(<UnitsOfMeasurePage />, { wrapper: PageWrapper })

    await waitFor(() => expect(screen.getByText('صندوق')).toBeInTheDocument())
    expect(screen.getAllByText('قطعة').length).toBeGreaterThan(0)
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(screen.getByText('غير نشط')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة وحدة قياس' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
  })

  it('sends an exact contract create request for catalog managers', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const createdUnit = createUnitOfMeasure({ code: 'BOX', nameAr: 'صندوق', symbolAr: 'ص' })
    let requestBody: unknown
    server.use(
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => HttpResponse.json([])),
      http.post(`${API_BASE_URL}/catalog/units-of-measure`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json(createdUnit, { status: 201 })
      }),
    )

    render(<UnitsOfMeasurePage />, { wrapper: PageWrapper })

    const createButton = await screen.findByRole('button', { name: 'إضافة وحدة قياس' })
    await user.click(createButton)
    await user.type(screen.getByLabelText('اسم الوحدة'), ' صندوق ')
    await user.type(screen.getByLabelText('رمز العرض'), ' ص ')
    await user.type(screen.getByLabelText('الرمز'), ' BOX ')
    await user.click(screen.getByRole('button', { name: 'إضافة الوحدة' }))

    await waitFor(() =>
      expect(requestBody).toEqual({
        code: 'BOX',
        nameAr: 'صندوق',
        symbolAr: 'ص',
        rowVersion: 0,
        status: 'Active',
      }),
    )
  })
})
