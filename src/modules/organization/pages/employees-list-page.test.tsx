import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEmployee, createPage, createSite } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import EmployeesListPage from './employees-list-page'

const API_BASE_URL = '/api/v1'

function createWrapper(options: { retry?: false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: options.retry === false ? false : 1 } },
  })

  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('EmployeesListPage', () => {
  it('renders contract-backed employee rows and sends zero-based server pagination', async () => {
    const employee = createEmployee()
    let receivedPageIndex: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/employees`, ({ request }) => {
        const url = new URL(request.url)
        receivedPageIndex = url.searchParams.get('pageIndex')
        receivedPageSize = url.searchParams.get('pageSize')
        return HttpResponse.json(createPage([employee], { totalItems: 11, totalPages: 2 }))
      }),
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([createSite()]))),
    )

    render(<EmployeesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'الموظفون' })).toBeInTheDocument()
    expect(await screen.findByText(employee.fullNameAr)).toBeInTheDocument()
    expect(screen.getByText(employee.employeeNumber)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الوحدة التنظيمية' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /إضافة موظف|تعديل/ })).not.toBeInTheDocument()
    expect(receivedPageIndex).toBe('0')
    expect(receivedPageSize).toBe('10')
  })

  it('sends selected site and status filters to the server', async () => {
    const user = userEvent.setup()
    const site = createSite()
    const receivedFilters: Array<{ siteId: string | null; status: string | null }> = []

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([site]))),
      http.get(`${API_BASE_URL}/employees`, ({ request }) => {
        const url = new URL(request.url)
        receivedFilters.push({
          siteId: url.searchParams.get('siteId'),
          status: url.searchParams.get('status'),
        })
        return HttpResponse.json(
          createPage([createEmployee({ site: { ...createEmployee().site, id: site.siteId } })]),
        )
      }),
    )

    render(<EmployeesListPage />, { wrapper: createWrapper() })

    await screen.findByText('موظف تجريبي')
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب الموقع' }))
    await user.click(await screen.findByRole('option', { name: site.nameAr }))
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة الموظف' }))
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    await waitFor(() =>
      expect(receivedFilters).toContainEqual({ siteId: site.siteId, status: 'Inactive' }),
    )
  })

  it('retries a failed list request through the Arabic error state', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([]))),
      http.get(`${API_BASE_URL}/employees`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(createPage([createEmployee()]))
      }),
    )

    render(<EmployeesListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل الموظفين' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('موظف تجريبي')).toBeInTheDocument()
  })
})
