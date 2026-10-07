import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MaterialsListPage from '@/modules/catalog/pages/materials-list-page'
import { wireMaterial, wireMaterialFamily } from '@/test/msw/catalog-wire-fixtures'
import { okPageJson } from '@/test/msw/envelope'
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
    const family = wireMaterialFamily()
    const material = wireMaterial()
    let receivedPage: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        const url = new URL(request.url)
        receivedPage = url.searchParams.get('page')
        receivedPageSize = url.searchParams.get('pageSize')
        return okPageJson([material], { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 })
      }),
      http.get(`${API_BASE_URL}/catalog/material-families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
    )

    render(<MaterialsListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'الأصناف' })).toBeInTheDocument()
    expect(await screen.findByText(material.nameAr)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: material.nameAr })).toHaveAttribute(
      'href',
      `/catalog/materials/${material.materialId}`,
    )
    // The material's unit reference is `unit`; `baseUnit` was the frozen
    // generated snapshot's fiction and no real record carries it.
    expect(screen.getByText(material.unit.displayName)).toBeInTheDocument()
    expect(screen.getByText(family.nameAr)).toBeInTheDocument()
    expect(screen.getByText('مستهلكة')).toBeInTheDocument()
    expect(screen.getByText('غير مطلوب')).toBeInTheDocument()
    // `ListMaterialsQuery` declares `page`, which is the parameter the backend
    // binds; `pageIndex` was the snapshot's name and the server discards it.
    expect(receivedPage).toBe('0')
    expect(receivedPageSize).toBe('10')
  })

  it('forwards family, kind, and status filters to the server', async () => {
    const user = userEvent.setup()
    const family = wireMaterialFamily()
    const receivedFilters: Array<{
      familyId: string | null
      materialKind: string | null
      status: string | null
    }> = []

    server.use(
      http.get(`${API_BASE_URL}/catalog/material-families`, () => okPageJson([family])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        const url = new URL(request.url)
        receivedFilters.push({
          familyId: url.searchParams.get('familyId'),
          materialKind: url.searchParams.get('materialKind'),
          status: url.searchParams.get('status'),
        })
        return okPageJson([wireMaterial()])
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
        familyId: family.materialFamilyId,
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
      http.get(`${API_BASE_URL}/catalog/material-families`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/catalog/materials`, ({ request }) => {
        attempts += 1
        searches.push(new URL(request.url).searchParams.get('search') ?? '')
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : okPageJson([wireMaterial()])
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
