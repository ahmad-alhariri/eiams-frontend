import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import MaterialFamiliesPage from '@/modules/catalog/pages/material-families-page'
import { createQueryClient } from '@/shared/services/query.client'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { fixtureUuid } from '@/test/msw/factories'
import type { MaterialCategory, MaterialFamily } from '@/modules/catalog/types/catalog.types'

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
const CATEGORY_ID = fixtureUuid(21)
const FAMILY_ID = fixtureUuid(22)

/**
 * Wire-shaped fixtures, minted locally: `catalog-wire-fixtures.ts` still mints
 * the frozen snapshot's records (`materialFamilyId`, `materialCategoryId`,
 * `nameAr`, nested `materialCategory` reference, `rowVersion`) and no longer
 * typechecks against `catalog.api-types`. The real family is
 * `{ id, categoryId, name, code, status }` — flat, with no category reference.
 */
function makeCategory(overrides: Partial<MaterialCategory> = {}): MaterialCategory {
  return {
    id: CATEGORY_ID,
    materialDomainId: fixtureUuid(20),
    parentCategoryId: null,
    name: 'الأجهزة',
    code: 'IT-HW',
    status: 'Active',
    ...overrides,
  }
}

function makeFamily(overrides: Partial<MaterialFamily> = {}): MaterialFamily {
  return {
    id: FAMILY_ID,
    categoryId: CATEGORY_ID,
    name: 'الحواسيب',
    code: 'IT-HW-PC',
    status: 'Active',
    ...overrides,
  }
}

function PageWrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
}

describe('MaterialFamiliesPage', () => {
  it('shows the contract hierarchy joined to the category list and hides write actions without catalog.manage', async () => {
    permissions.canManage = false
    const category = makeCategory()
    const family = makeFamily()
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await waitFor(() => expect(screen.getByText(family.name)).toBeInTheDocument())
    expect(screen.getByText(family.code)).toBeInTheDocument()
    // A family carries its `categoryId` only — no nested category reference — so
    // the directory's category column is a join against the category list.
    expect(screen.getByText(category.name)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'التصنيف' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة عائلة' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `تعديل ${family.name}` })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `تعطيل ${family.name}` })).not.toBeInTheDocument()
  })

  it('submits the exact family request using an active category only', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const activeCategory = makeCategory({ name: 'الأجهزة', status: 'Active' })
    const inactiveCategory = makeCategory({
      id: fixtureUuid(90),
      name: 'تصنيف متوقف',
      status: 'Inactive',
    })
    let requestBody: unknown
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/categories`, () =>
        okPageJson([activeCategory, inactiveCategory]),
      ),
      http.post(`${API_BASE_URL}/catalog/families`, async ({ request }) => {
        requestBody = await request.json()
        return okJson(makeFamily())
      }),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: 'إضافة عائلة' }))
    await user.type(screen.getByLabelText('اسم العائلة'), ' الحواسيب ')
    await user.type(screen.getByLabelText('رمز العائلة'), ' IT-HW-PC ')
    await user.click(screen.getByRole('combobox', { name: 'التصنيف' }))
    expect(screen.queryByRole('option', { name: 'تصنيف متوقف' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('option', { name: activeCategory.name }))
    await user.click(screen.getByRole('button', { name: 'إضافة العائلة' }))

    await waitFor(() =>
      // `POST /catalog/families` binds `categoryId`, `name` and `code`: no
      // `status` (Active by definition) and no version token.
      expect(requestBody).toEqual({
        categoryId: activeCategory.id,
        code: 'IT-HW-PC',
        name: 'الحواسيب',
      }),
    )
  })

  it('updates only the name and code, because a family is not re-categorised', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const category = makeCategory()
    const family = makeFamily()
    let requestBody: unknown
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
      http.put(`${API_BASE_URL}/catalog/families/${family.id}`, async ({ request }) => {
        requestBody = await request.json()
        return okJson(family)
      }),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: `تعديل ${family.name}` }))
    const nameInput = screen.getByLabelText('اسم العائلة')
    await user.clear(nameInput)
    await user.type(nameInput, 'حواسيب محدّثة')
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() =>
      expect(requestBody).toEqual({
        code: family.code,
        name: 'حواسيب محدّثة',
      }),
    )
  })

  it('filters the loaded page locally, because no family list binds a search parameter', async () => {
    permissions.canManage = false
    const user = userEvent.setup()
    const category = makeCategory()
    const first = makeFamily({ id: fixtureUuid(22), name: 'الحواسيب', code: 'IT-HW-PC' })
    const second = makeFamily({ id: fixtureUuid(23), name: 'الطابعات', code: 'IT-PRN' })
    const searches: Array<string | null> = []
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, ({ request }) => {
        searches.push(new URL(request.url).searchParams.get('search'))
        return okPageJson([first, second])
      }),
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })
    await screen.findByText(first.name)
    // The search box is the shared server-table input, and its placeholder says
    // out loud that the scope is the page on screen.
    expect(
      screen.getByPlaceholderText('ابحث في الصفحة الحالية بالاسم أو الرمز...'),
    ).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), 'طابعات')

    await waitFor(() => expect(screen.queryByText(first.name)).not.toBeInTheDocument())
    expect(screen.getByText(second.name)).toBeInTheDocument()
    // The route binds `categoryId` and `status` — never `search`. Sending one
    // was fiction the server silently ignored.
    expect(searches.every((search) => search === null)).toBe(true)
  })

  it('paginates server-side from page 1 and offers no page=0', async () => {
    permissions.canManage = false
    const user = userEvent.setup()
    const category = makeCategory()
    const receivedPages: Array<string | null> = []
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, ({ request }) => {
        const params = new URL(request.url).searchParams
        receivedPages.push(params.get('page'))
        const page = Number(params.get('page') ?? '1')
        const names = Array.from(
          { length: page === 2 ? 2 : 10 },
          (_, index) => `عائلة ${page}-${index + 1}`,
        )

        return okPageJson(
          names.map((name, index) => makeFamily({ id: fixtureUuid(80 + page * 10 + index), name })),
          { page, pageSize: 10, totalCount: 12, totalPages: 2 },
        )
      }),
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    const pager = await screen.findByRole('navigation', { name: 'تنقل بين الصفحات' })
    expect(receivedPages[0]).toBe('1')
    expect(await within(pager).findByText('صفحة ١ من ٢')).toBeInTheDocument()

    await user.click(within(pager).getByRole('button', { name: 'الصفحة التالية' }))

    await waitFor(() => expect(receivedPages.at(-1)).toBe('2'))
    expect(receivedPages.every((page) => page !== '0')).toBe(true)
    expect(await screen.findByText('عائلة 2-1')).toBeInTheDocument()
  })

  it('loads the category reference at the backend maximum and admits the limit', async () => {
    permissions.canManage = false
    const categoryRequests: Array<{ page: string | null; pageSize: string | null }> = []
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([makeFamily()])),
      http.get(`${API_BASE_URL}/catalog/categories`, ({ request }) => {
        const params = new URL(request.url).searchParams
        categoryRequests.push({ page: params.get('page'), pageSize: params.get('pageSize') })
        return okPageJson([makeCategory()], { page: 1, pageSize: 100, totalCount: 240 })
      }),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    // The `التصنيف` column is a join against the category list, so that list is
    // a reference load: it asks for the largest legal page (100, never more) and
    // says in Arabic when even that is not the whole directory.
    await waitFor(() => expect(categoryRequests.length).toBeGreaterThan(0))
    expect(categoryRequests[0]).toEqual({ page: '1', pageSize: '100' })
    expect(await screen.findByText(/أول مئة تصنيف/)).toBeInTheDocument()
  })

  it('retries a failed directory request from the Arabic error state', async () => {
    permissions.canManage = false
    const user = userEvent.setup()
    const category = makeCategory()
    const family = makeFamily()
    let remainingInitialFailures = 2
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => {
        if (remainingInitialFailures > 0) {
          remainingInitialFailures -= 1
          return new HttpResponse(null, { status: 500 })
        }
        return okPageJson([family])
      }),
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await user.click(
      await screen.findByRole('button', { name: 'إعادة المحاولة' }, { timeout: 3_000 }),
    )
    expect(await screen.findByText(family.name)).toBeInTheDocument()
  })

  it('explains when the dependent category reference data cannot be loaded', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/categories`, () => new HttpResponse(null, { status: 500 })),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })

    await user.click(await screen.findByRole('button', { name: 'إضافة عائلة' }))
    expect(
      await screen.findByText('تعذّر تحميل التصنيفات النشطة. أغلق النافذة وحاول مرة أخرى.'),
    ).toBeInTheDocument()
  })

  it('deactivates through the integer status command', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const category = makeCategory()
    const family = makeFamily()
    const statusBodies: unknown[] = []
    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
      http.put(`${API_BASE_URL}/catalog/families/${family.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<MaterialFamiliesPage />, { wrapper: PageWrapper })
    await user.click(await screen.findByRole('button', { name: `تعطيل ${family.name}` }))
    const confirmation = await screen.findByRole('alertdialog')
    await user.click(within(confirmation).getByRole('button', { name: 'تعطيل العائلة' }))

    await waitFor(() => expect(statusBodies).toEqual([{ status: 1 }]))
  })
})
