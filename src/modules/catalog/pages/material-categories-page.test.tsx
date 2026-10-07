import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  wireMaterialCategory,
  wireMaterialDomain,
  wireNamedReference,
} from '@/test/msw/catalog-wire-fixtures'
import { okJson, okPageJson } from '@/test/msw/envelope'
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
    const category = wireMaterialCategory()
    server.use(
      http.get(`${API_BASE_URL}/catalog/material-categories`, () => okPageJson([category])),
      http.get(`${API_BASE_URL}/catalog/material-domains`, () => okPageJson([])),
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
    const domain = wireMaterialDomain()
    const receivedBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/material-categories`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/material-domains`, () => okPageJson([domain])),
      http.post(`${API_BASE_URL}/catalog/material-categories`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return okJson(wireMaterialCategory())
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
          materialDomainId: domain.materialDomainId,
          nameAr: 'الأجهزة',
          // A category with no parent sends an explicit null: the field is part
          // of the request contract, not an omission the client may choose.
          parentCategoryId: null,
          rowVersion: 0,
          status: 'Active',
        },
      ]),
    )
  })

  it('updates a tree node with its row version', async () => {
    permissions.canManage = true
    const domain = wireMaterialDomain()
    const category = wireMaterialCategory({
      materialDomain: wireNamedReference(domain.materialDomainId, domain.nameAr),
      rowVersion: 7,
    })
    let receivedBody: unknown = null
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/material-categories`, () => okPageJson([category])),
      http.get(`${API_BASE_URL}/catalog/material-domains`, () => okPageJson([domain])),
      http.put(
        `${API_BASE_URL}/catalog/material-categories/${category.materialCategoryId}`,
        async ({ request }) => {
          receivedBody = await request.json()
          return okJson({ ...category, nameAr: 'أجهزة محدثة' })
        },
      ),
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
        materialDomainId: domain.materialDomainId,
        nameAr: 'أجهزة محدثة',
        parentCategoryId: null,
        rowVersion: 7,
        status: category.status,
      }),
    )
  })
})
