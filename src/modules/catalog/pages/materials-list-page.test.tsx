import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MaterialsListPage from '@/modules/catalog/pages/materials-list-page'
import { createMaterial, createMaterialFamily, createPage } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

function createWrapper(options: { retry?: false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: options.retry === false ? false : 1 } },
  })

  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('MaterialsListPage', () => {
  it('renders contract-backed materials and sends zero-based server pagination', async () => {
    const material = createMaterial()
    const family = createMaterialFamily()
    let receivedPageIndex: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        const url = new URL(request.url)
        receivedPageIndex = url.searchParams.get('pageIndex')
        receivedPageSize = url.searchParams.get('pageSize')
        return HttpResponse.json(createPage([material], { totalItems: 11, totalPages: 2 }))
      }),
      http.get(`${API_BASE_URL}/catalog/families`, () => HttpResponse.json([family])),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'الأصناف' })).toBeInTheDocument()
    expect(await screen.findByText(material.nameAr)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: material.nameAr })).toHaveAttribute(
      'href',
      `/catalog/materials/${material.materialId}`,
    )
    expect(screen.getByText(material.baseUnit.displayName)).toBeInTheDocument()
    expect(screen.getByText('بالكمية')).toBeInTheDocument()
    expect(receivedPageIndex).toBe('0')
    expect(receivedPageSize).toBe('10')
  })

  it('forwards family, kind, and status filters to the server', async () => {
    const user = userEvent.setup()
    const family = createMaterialFamily()
    const receivedFilters: Array<{
      familyId: string | null
      materialKind: string | null
      status: string | null
    }> = []

    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => HttpResponse.json([family])),
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        const url = new URL(request.url)
        receivedFilters.push({
          familyId: url.searchParams.get('familyId'),
          materialKind: url.searchParams.get('materialKind'),
          status: url.searchParams.get('status'),
        })
        return HttpResponse.json(
          createPage([createMaterial({ family: { ...family.category, id: family.familyId } })]),
        )
      }),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })

    await screen.findByText('حاسوب مكتبي')
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب العائلة' }))
    await user.click(await screen.findByRole('option', { name: family.nameAr }))
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب نوع الصنف' }))
    await user.click(await screen.findByRole('option', { name: 'أصل ثابت' }))
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة الصنف' }))
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    await waitFor(() =>
      expect(receivedFilters).toContainEqual({
        familyId: family.familyId,
        materialKind: 'Asset',
        status: 'Inactive',
      }),
    )
  })

  it('debounces the search and retries a failed materials request', async () => {
    const user = userEvent.setup()
    const searches: string[] = []
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/catalog/families`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        attempts += 1
        searches.push(new URL(request.url).searchParams.get('search') ?? '')
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([createMaterial()]))
      }),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل الأصناف' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await screen.findByText('حاسوب مكتبي')
    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), 'حاسوب')

    await waitFor(() => expect(searches).toContain('حاسوب'))
  })
})
