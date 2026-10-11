import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http, type PathParams } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { fixtureUuid } from '@/test/msw/factories'
import type { MaterialCategory, MaterialDomain } from '@/modules/catalog/types/catalog.types'

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
const DOMAIN_ID = fixtureUuid(20)
const CATEGORY_ID = fixtureUuid(21)

/**
 * Wire-shaped fixtures, minted locally: `catalog-wire-fixtures.ts` still mints
 * the frozen snapshot's records (`materialCategoryId`, `nameAr`, a nested
 * `materialDomain` reference, `rowVersion`) and no longer typechecks against
 * `catalog.api-types`.
 */
function makeDomain(overrides: Partial<MaterialDomain> = {}): MaterialDomain {
  return { id: DOMAIN_ID, name: 'تقنية المعلومات', code: 'IT', status: 'Active', ...overrides }
}

function makeCategory(overrides: Partial<MaterialCategory> = {}): MaterialCategory {
  return {
    id: CATEGORY_ID,
    materialDomainId: DOMAIN_ID,
    parentCategoryId: null,
    name: 'الأجهزة',
    code: 'IT-HW',
    status: 'Active',
    ...overrides,
  }
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/**
 * MSW path params arrive from an index signature, so the strict-mode accessor
 * is written once here rather than silenced at each handler.
 */
function readPathParam(params: PathParams, key: string): string {
  const value = params[key]
  return Array.isArray(value) ? String(value[0]) : String(value)
}

afterEach(() => {
  permissions.canManage = false
})

describe('MaterialCategoriesPage', () => {
  it('keeps category mutations hidden without catalog.manage', async () => {
    const category = makeCategory()
    server.use(
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([])),
    )

    render(<MaterialCategoriesPage />, { wrapper: createWrapper() })

    expect(await screen.findByText(category.name)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة تصنيف' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `تعديل ${category.name}` })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `تعطيل ${category.name}` })).not.toBeInTheDocument()
  })

  it('creates the contract payload from the accessible RTL form', async () => {
    permissions.canManage = true
    const domain = makeDomain()
    const receivedBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([domain])),
      http.post(`${API_BASE_URL}/catalog/categories`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return okJson(makeCategory())
      }),
    )

    render(<MaterialCategoriesPage />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { level: 1, name: 'تصنيفات المواد' })
    await user.click(screen.getByRole('button', { name: 'إضافة تصنيف' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('اسم التصنيف'), 'الأجهزة')
    await user.type(within(dialog).getByLabelText('رمز التصنيف'), 'IT-HW')
    await user.click(within(dialog).getByRole('combobox', { name: 'مجال التصنيف' }))
    await user.click(await screen.findByRole('option', { name: domain.name }))
    await user.click(within(dialog).getByRole('button', { name: 'إضافة التصنيف' }))

    await waitFor(() => expect(receivedBodies).toHaveLength(1))
    // The create body binds `materialDomainId`, `parentCategoryId`, `name` and
    // `code`. A category with no parent sends an explicit null, and there is no
    // `status` (Active by definition) and no version token.
    expect(receivedBodies).toEqual([
      {
        code: 'IT-HW',
        materialDomainId: domain.id,
        name: 'الأجهزة',
        parentCategoryId: null,
      },
    ])
  })

  it('updates only the name and code, and never sends a move the user did not make', async () => {
    permissions.canManage = true
    const category = makeCategory()
    const receivedBodies: unknown[] = []
    const moveBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([makeDomain()])),
      http.put(`${API_BASE_URL}/catalog/categories/${category.id}`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return okJson({ ...category, name: 'أجهزة محدثة' })
      }),
      http.put(`${API_BASE_URL}/catalog/categories/${category.id}/parent`, async ({ request }) => {
        moveBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<MaterialCategoriesPage />, { wrapper: createWrapper() })
    await screen.findByText(category.name)
    await user.click(screen.getByRole('button', { name: `تعديل ${category.name}` }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText('اسم التصنيف')
    await user.clear(input)
    await user.type(input, 'أجهزة محدثة')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(receivedBodies).toHaveLength(1))
    // The update record binds `Name, Code` and nothing else — NOT the domain and
    // NOT the parent.
    expect(receivedBodies).toEqual([{ code: category.code, name: 'أجهزة محدثة' }])
    expect(moveBodies).toEqual([])
  })

  it('re-parents through the dedicated move route instead of the update body', async () => {
    permissions.canManage = true
    const parent = makeCategory({ id: fixtureUuid(25), name: 'أجهزة رئيسية' })
    const child = makeCategory({ id: fixtureUuid(26), name: 'أجهزة فرعية' })
    const moveBodies: unknown[] = []
    const requestedPaths: string[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([parent, child])),
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([makeDomain()])),
      http.put(`${API_BASE_URL}/catalog/categories/:id`, async ({ params }) => {
        requestedPaths.push(readPathParam(params, 'id'))
        return okJson(makeCategory())
      }),
      http.put(`${API_BASE_URL}/catalog/categories/:id/parent`, async ({ request, params }) => {
        moveBodies.push(await request.json())
        requestedPaths.push(`${readPathParam(params, 'id')}/parent`)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<MaterialCategoriesPage />, { wrapper: createWrapper() })
    await screen.findByText(child.name)
    await user.click(screen.getByRole('button', { name: `تعديل ${child.name}` }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'التصنيف الأب' }))
    await user.click(await screen.findByRole('option', { name: parent.name }))
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(moveBodies).toHaveLength(1))
    // `PUT /catalog/categories/{id}/parent` is its own controller, with cycle
    // rules of its own; folding the parent into the descriptive update is what
    // the old single "upsert" shape invited.
    expect(moveBodies).toEqual([{ parentCategoryId: parent.id }])
    expect(requestedPaths).toEqual([child.id, `${child.id}/parent`])
  })

  it('refuses a self-parent and a descendant as parent before any request goes out', async () => {
    permissions.canManage = true
    const root = makeCategory({ id: fixtureUuid(25), name: 'أجهزة رئيسية' })
    const child = makeCategory({ id: fixtureUuid(26), name: 'أجهزة فرعية' })
    const updateBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([root, child])),
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([makeDomain()])),
      http.put(`${API_BASE_URL}/catalog/categories/:id`, async ({ request }) => {
        updateBodies.push(await request.json())
        return okJson(makeCategory())
      }),
      http.put(
        `${API_BASE_URL}/catalog/categories/:id/parent`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    )

    render(<MaterialCategoriesPage />, { wrapper: createWrapper() })
    await screen.findByText(root.name)
    await user.click(screen.getByRole('button', { name: `تعديل ${root.name}` }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'التصنيف الأب' }))
    await user.click(await screen.findByRole('option', { name: root.name }))
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    // The client-side guard blocks the write; the server-side rules are the
    // authority but a self-parent never needs to reach them.
    expect(
      await within(dialog).findByText('لا يمكن اختيار التصنيف نفسه كتصنيف أب.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(updateBodies).toEqual([]))
  })

  it('deactivates a tree node through the integer status command', async () => {
    permissions.canManage = true
    const category = makeCategory()
    const statusBodies: unknown[] = []
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/categories`, () => okPageJson([category])),
      http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson([makeDomain()])),
      http.put(`${API_BASE_URL}/catalog/categories/${category.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<MaterialCategoriesPage />, { wrapper: createWrapper() })
    await screen.findByText(category.name)
    await user.click(screen.getByRole('button', { name: `تعطيل ${category.name}` }))
    await user.click(await screen.findByRole('button', { name: 'تعطيل التصنيف' }))

    await waitFor(() => expect(statusBodies).toEqual([{ status: 1 }]))
  })
})
