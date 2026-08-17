import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MaterialsListPage from '@/modules/catalog/pages/materials-list-page'
import {
  createMaterial,
  createMaterialFamily,
  createPage,
  createUnitOfMeasure,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))
const permission = vi.hoisted(() => ({ canManage: true }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => permission.canManage && code === 'catalog.manage',
    hasAll: () => false,
    hasAny: () => false,
  }),
}))

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function registerReferenceHandlers() {
  const family = createMaterialFamily()
  const unit = createUnitOfMeasure()
  const material = createMaterial()

  server.use(
    http.get(`${API_BASE_URL}/catalog/materials`, () => HttpResponse.json(createPage([material]))),
    http.get(`${API_BASE_URL}/catalog/families`, () => HttpResponse.json([family])),
    http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => HttpResponse.json([unit])),
  )

  return { family, material, unit }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  permission.canManage = true
})

describe('MaterialsListPage material form integration', () => {
  it('opens the material core form through the RBAC-gated create control', async () => {
    const user = userEvent.setup()
    registerReferenceHandlers()

    render(<MaterialsListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'إضافة مادة' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText('اسم المادة')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'إضافة المادة' })).toBeInTheDocument()
  })

  it('updates the selected material with its current row version', async () => {
    const user = userEvent.setup()
    const { material } = registerReferenceHandlers()
    let received: unknown

    server.use(
      http.put(`${API_BASE_URL}/catalog/materials/${material.materialId}`, async ({ request }) => {
        received = await request.json()
        return HttpResponse.json(material)
      }),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: `تعديل ${material.nameAr}` }))
    const dialog = await screen.findByRole('dialog')
    const description = within(dialog).getByLabelText('وصف المادة')
    await user.clear(description)
    await user.type(description, 'وصف محدّث')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() =>
      expect(received).toMatchObject({
        descriptionAr: 'وصف محدّث',
        rowVersion: material.rowVersion,
      }),
    )
  })

  it('does not render material mutations for a session without catalog management', async () => {
    permission.canManage = false
    registerReferenceHandlers()

    render(<MaterialsListPage />, { wrapper: createWrapper() })

    expect(screen.queryByRole('button', { name: 'إضافة مادة' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
  })
})
