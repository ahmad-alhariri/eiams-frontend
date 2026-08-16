import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { createMaterial } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import MaterialDetailPage from './material-detail-page'

const API_BASE_URL = '/api/v1'
const MATERIAL_ID = '00000000-0000-4000-8000-000000000018'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' as const } }),
}))

function LocationProbe() {
  const { pathname } = useLocation()
  return <p data-testid="location">{pathname}</p>
}

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter initialEntries={[`/catalog/materials/${MATERIAL_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/catalog/materials/:materialId" element={children} />
          <Route path="/catalog/materials" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('MaterialDetailPage', () => {
  it('renders the read-only hierarchy and D-MAT-01 asset policy', async () => {
    const material = createMaterial({
      materialKind: 'Asset',
      requiresAssetNumber: true,
      trackingType: 'Serial',
    })
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/${material.materialId}`, () =>
        HttpResponse.json(material),
      ),
    )

    render(<MaterialDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: material.nameAr })).toBeInTheDocument()
    expect(screen.getByText(material.domain.displayName)).toBeInTheDocument()
    expect(screen.getByText(material.category.displayName)).toBeInTheDocument()
    expect(screen.getByText(material.family.displayName)).toBeInTheDocument()
    expect(screen.getByText('أصل ثابت')).toBeInTheDocument()
    expect(screen.getByText('بالرقم التسلسلي')).toBeInTheDocument()
    expect(screen.getByText('مطلوب (رقم أصل داخلي)')).toBeInTheDocument()
    expect(screen.getByText(/سجل الأصول/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
  })

  it('retries an unavailable material and provides a return path', async () => {
    const material = createMaterial()
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(material)
      }),
    )

    render(<MaterialDetailPage />, { wrapper: PageWrapper })
    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل المادة' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByRole('heading', { name: material.nameAr })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'العودة إلى الأصناف' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/materials')
  })

  it('shows a safe empty state when a successful response contains no material', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${API_BASE_URL}/catalog/materials/${MATERIAL_ID}`, () => HttpResponse.json(null)),
    )

    render(<MaterialDetailPage />, { wrapper: PageWrapper })
    expect(
      await screen.findByRole('heading', { name: 'لا تتوفر بيانات المادة' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'العودة إلى الأصناف' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/materials')
  })
})
