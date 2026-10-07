import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { okJson } from '@/test/msw/envelope'
import { createSite } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'organization.manage' && permissions.canManage,
  }),
}))

import SiteDetailPage from './site-detail-page'

const API_BASE_URL = '/api/v1'
const SITE_ID = '00000000-0000-4000-8000-000000000032'

function LocationProbe() {
  const { pathname } = useLocation()
  return <p data-testid="location">{pathname}</p>
}

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return (
    <MemoryRouter initialEntries={[`/organization/sites/${SITE_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/organization/sites/:siteId" element={children} />
          <Route path="/organization/sites" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

afterEach(() => {
  permissions.canManage = false
})

describe('SiteDetailPage', () => {
  it('renders contract-backed site details and keeps edit unavailable without organization.manage', async () => {
    const site = createSite({ location: null, governorateCode: null, status: 'Inactive' })

    server.use(http.get(`${API_BASE_URL}/sites/${site.id}`, () => okJson(site)))

    render(<SiteDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: site.name })).toBeInTheDocument()
    expect(screen.getByText(`رمز الموقع: ${site.code}`)).toBeInTheDocument()
    expect(screen.getByText('غير نشط')).toBeInTheDocument()
    // المحافظة and العنوان are the only two fields this site leaves empty; both
    // render a dash rather than a blank cell.
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText(site.organizationId)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تعديل الموقع' })).not.toBeInTheDocument()
  })

  it('shows the location and governorate code the projection actually serves', async () => {
    const site = createSite({ location: 'دمشق', governorateCode: 'DIM' })

    server.use(http.get(`${API_BASE_URL}/sites/${site.id}`, () => okJson(site)))

    render(<SiteDetailPage />, { wrapper: PageWrapper })

    await screen.findByRole('heading', { name: site.name })
    expect(screen.getByText('دمشق')).toBeInTheDocument()
    expect(screen.getByText('DIM')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('retries an unavailable detail request and provides a return path', async () => {
    const site = createSite()
    let attempts = 0
    const user = userEvent.setup()

    server.use(
      http.get(`${API_BASE_URL}/sites/${site.id}`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okJson(site)
      }),
    )

    render(<SiteDetailPage />, { wrapper: PageWrapper })

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل الموقع' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByRole('heading', { name: site.name })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'العودة إلى المواقع' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/organization/sites')
  })

  it('reuses the site form to save detail edits for a permitted user', async () => {
    permissions.canManage = true
    // Site serves no row version, so this record carries nothing for the update
    // body to echo back.
    const site = createSite()
    let receivedBody: unknown = null
    const user = userEvent.setup()

    server.use(
      http.get(`${API_BASE_URL}/sites/${site.id}`, () => okJson(site)),
      http.put(`${API_BASE_URL}/sites/${site.id}`, async ({ request }) => {
        receivedBody = await request.json()
        // `PUT /sites/{id}` answers with an empty body.
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<SiteDetailPage />, { wrapper: PageWrapper })

    await screen.findByRole('heading', { name: site.name })
    await user.click(screen.getByRole('button', { name: 'تعديل الموقع' }))
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByLabelText('اسم الموقع')
    await user.clear(nameInput)
    await user.type(nameInput, 'المقر المحدّث')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(receivedBody).not.toBeNull())
    // `PUT /sites/{id}` binds name / location / governorateCode only:
    // organizationId and code are create-only, and there is no status and no
    // ExpectedRowVersion to send.
    expect(receivedBody).toEqual({
      name: 'المقر المحدّث',
      location: site.location,
      governorateCode: site.governorateCode,
    })
  })
})
