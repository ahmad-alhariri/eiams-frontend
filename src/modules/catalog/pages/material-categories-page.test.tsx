import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMaterialCategory, createMaterialDomain } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))
vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'catalog.manage' && permissions.canManage,
  }),
}))

import MaterialCategoriesPage from './material-categories-page'

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  permissions.canManage = false
})

describe('MaterialCategoriesPage', () => {
  it('keeps category mutations hidden without catalog.manage', async () => {
    const category = createMaterialCategory()
    server.use(
      http.get(`${API_BASE_URL}/catalog/categories`, () => HttpResponse.json([category])),
      http.get(`${API_BASE_URL}/catalog/domains`, () => HttpResponse.json([])),
    )

    render(<MaterialCategoriesPage />, { wrapper: createWrapper() })

    expect(await screen.findByText(category.nameAr)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة تصنيف' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `تعديل ${category.nameAr}` }),
    ).not.toBeInTheDocument()
  })

  it('creates the contract payload from the accessible RTL form', async () => {
    permissions.canManage = true
    const domain = createMaterialDomain()
    const receivedBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/categories`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/catalog/domains`, () => HttpResponse.json([domain])),
      http.post(`${API_BASE_URL}/catalog/categories`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(createMaterialCategory())
      }),
    )

    render(<MaterialCategoriesPage />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { level: 1, name: 'تصنيفات المواد' })
    await user.click(screen.getByRole('button', { name: 'إضافة تصنيف' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('اسم التصنيف'), 'الأجهزة')
    await user.type(within(dialog).getByLabelText('رمز التصنيف'), 'IT-HW')
    await user.click(within(dialog).getByRole('combobox', { name: 'مجال التصنيف' }))
    await user.click(await screen.findByRole('option', { name: domain.nameAr }))
    await user.click(within(dialog).getByRole('button', { name: 'إضافة التصنيف' }))

    await waitFor(() =>
      expect(receivedBodies).toEqual([
        {
          code: 'IT-HW',
          domainId: domain.domainId,
          nameAr: 'الأجهزة',
          rowVersion: 0,
          status: 'Active',
        },
      ]),
    )
  })

  it('updates a tree node with its row version', async () => {
    permissions.canManage = true
    const domain = createMaterialDomain()
    const category = createMaterialCategory({
      domain: { id: domain.domainId, displayName: domain.nameAr },
      rowVersion: 7,
    })
    let receivedBody: unknown = null
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/categories`, () => HttpResponse.json([category])),
      http.get(`${API_BASE_URL}/catalog/domains`, () => HttpResponse.json([domain])),
      http.put(`${API_BASE_URL}/catalog/categories/${category.categoryId}`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ ...category, nameAr: 'أجهزة محدثة' })
      }),
    )

    render(<MaterialCategoriesPage />, { wrapper: createWrapper() })
    await screen.findByText(category.nameAr)
    await user.click(screen.getByRole('button', { name: `تعديل ${category.nameAr}` }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText('اسم التصنيف')
    await user.clear(input)
    await user.type(input, 'أجهزة محدثة')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() =>
      expect(receivedBody).toEqual({
        code: category.code,
        domainId: domain.domainId,
        nameAr: 'أجهزة محدثة',
        rowVersion: 7,
        status: category.status,
      }),
    )
  })
})
