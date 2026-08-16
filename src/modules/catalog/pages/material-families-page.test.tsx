import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import MaterialFamiliesPage from '@/modules/catalog/pages/material-families-page'
import { createQueryClient } from '@/shared/services/query.client'
import { createMaterialCategory, createMaterialFamily } from '@/test/msw/factories'
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

describe('MaterialFamiliesPage', () => {
  it('shows the contract hierarchy and hides write actions without catalog.manage', async () => {
    permissions.canManage = false
    const family = createMaterialFamily()
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => HttpResponse.json([family])),
      http.get(`${API_BASE_URL}/catalog/categories`, () => HttpResponse.json([])),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await waitFor(() => expect(screen.getByText(family.nameAr)).toBeInTheDocument())
    expect(screen.getByText(family.domain.displayName)).toBeInTheDocument()
    expect(screen.getByText(family.category.displayName)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة عائلة' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `تعديل ${family.nameAr}` })).not.toBeInTheDocument()
  })

  it('submits the exact family request using an active category only', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const activeCategory = createMaterialCategory({ nameAr: 'الأجهزة', status: 'Active' })
    const inactiveCategory = createMaterialCategory({
      categoryId: '00000000-0000-4000-8000-000000000099',
      nameAr: 'تصنيف متوقف',
      status: 'Inactive',
    })
    const createdFamily = createMaterialFamily({
      category: {
        ...activeCategory.domain,
        id: activeCategory.categoryId,
        displayName: activeCategory.nameAr,
      },
      code: 'IT-HW-PC',
      nameAr: 'الحواسيب',
    })
    let requestBody: unknown
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/catalog/categories`, () =>
        HttpResponse.json([activeCategory, inactiveCategory]),
      ),
      http.post(`${API_BASE_URL}/catalog/families`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json(createdFamily, { status: 201 })
      }),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: 'إضافة عائلة' }))
    await user.type(screen.getByLabelText('اسم العائلة'), ' الحواسيب ')
    await user.type(screen.getByLabelText('رمز العائلة'), ' IT-HW-PC ')
    await user.click(screen.getByRole('combobox', { name: 'التصنيف' }))
    expect(screen.queryByRole('option', { name: 'تصنيف متوقف' })).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole('option', {
        name: activeCategory.pathDisplay ?? activeCategory.nameAr,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'إضافة العائلة' }))

    await waitFor(() =>
      expect(requestBody).toEqual({
        categoryId: activeCategory.categoryId,
        code: 'IT-HW-PC',
        nameAr: 'الحواسيب',
        rowVersion: 0,
        status: 'Active',
      }),
    )
  })

  it('preserves the current row version when a catalog manager edits a family', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const category = createMaterialCategory()
    const family = createMaterialFamily({ rowVersion: 7 })
    let requestBody: unknown
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => HttpResponse.json([family])),
      http.get(`${API_BASE_URL}/catalog/categories`, () => HttpResponse.json([category])),
      http.put(`${API_BASE_URL}/catalog/families/${family.familyId}`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json(family)
      }),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: `تعديل ${family.nameAr}` }))
    const nameInput = screen.getByLabelText('اسم العائلة')
    await user.clear(nameInput)
    await user.type(nameInput, 'حواسيب محدّثة')
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() =>
      expect(requestBody).toEqual({
        categoryId: category.categoryId,
        code: family.code,
        nameAr: 'حواسيب محدّثة',
        rowVersion: 7,
        status: family.status,
      }),
    )
  })

  it('retries the directory request and debounces the contract search query', async () => {
    permissions.canManage = false
    const user = userEvent.setup()
    const family = createMaterialFamily()
    let remainingInitialFailures = 2
    const searches: string[] = []
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, ({ request }) => {
        const search = new URL(request.url).searchParams.get('search') ?? ''
        searches.push(search)
        if (remainingInitialFailures > 0) {
          remainingInitialFailures -= 1
          return HttpResponse.json({ titleAr: 'تعذّر التحميل' }, { status: 500 })
        }
        return HttpResponse.json([family])
      }),
      http.get(`${API_BASE_URL}/catalog/categories`, () => HttpResponse.json([])),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await user.click(
      await screen.findByRole('button', { name: 'إعادة المحاولة' }, { timeout: 3_000 }),
    )
    await screen.findByText(family.nameAr)
    await user.type(screen.getByLabelText('البحث في العائلات'), 'حواسيب')

    await waitFor(() => expect(searches).toContain('حواسيب'))
  })

  it('explains when the dependent category reference data cannot be loaded', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/catalog/categories`, () =>
        HttpResponse.json({ titleAr: 'تعذّر تحميل التصنيفات' }, { status: 500 }),
      ),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: 'إضافة عائلة' }))
    expect(
      await screen.findByText('تعذّر تحميل التصنيفات النشطة. أغلق النافذة وحاول مرة أخرى.'),
    ).toBeInTheDocument()
  })
})
