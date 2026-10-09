import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { okPageJson } from '@/test/msw/envelope'
import { createEmployee, createOrganizationalUnit, createSite } from '@/test/msw/factories'
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
  it('renders contract-backed employee rows and sends one-based server pagination', async () => {
    const employee = createEmployee()
    const orgUnit = createOrganizationalUnit()
    let receivedPage: string | null = null
    let receivedPageSize: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/employees`, ({ request }) => {
        const url = new URL(request.url)
        receivedPage = url.searchParams.get('page')
        receivedPageSize = url.searchParams.get('pageSize')
        return okPageJson([employee], { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 })
      }),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([createSite()])),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([orgUnit])),
    )

    render(<EmployeesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { level: 1, name: 'الموظفون' })).toBeInTheDocument()
    expect(await screen.findByText(employee.fullName)).toBeInTheDocument()
    expect(screen.getByText(employee.employeeNumber)).toBeInTheDocument()
    // The org-unit label is joined from `employee.orgUnitId` against the
    // org-units list, because the projection carries no nested unit.
    expect(await screen.findByText(orgUnit.name)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الوحدة التنظيمية' })).toBeInTheDocument()
    // There is deliberately NO site column: an employee record cannot supply a
    // site name. The site names the directory knows about live in the filter.
    expect(screen.queryByRole('columnheader', { name: 'الموقع' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /إضافة موظف|تعديل/ })).not.toBeInTheDocument()
    // The wire page is one-based (`PaginationQueryParameters.Page` is
    // `[Range(1, 21474836)]`), and so is `useServerPagination`, so the page
    // number crosses unchanged. Subtracting one sent `page=0` and the backend
    // answered 400 REQUEST_VALIDATION_FAILED.
    expect(receivedPage).toBe('1')
    expect(receivedPageSize).toBe('10')
  })

  it('shows a dash when the employee org unit is missing from the loaded units list', async () => {
    const employee = createEmployee({ orgUnitId: '00000000-0000-4000-8000-00000000ffff' })

    server.use(
      http.get(`${API_BASE_URL}/employees`, () => okPageJson([employee])),
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([])),
      // The units list answers without the employee's unit, so the join misses.
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([])),
    )

    render(<EmployeesListPage />, { wrapper: createWrapper() })

    expect(await screen.findByText(employee.fullName)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('sends selected site and status filters to the server', async () => {
    const user = userEvent.setup()
    const site = createSite()
    const receivedFilters: Array<{ siteId: string | null; status: string | null }> = []

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/employees`, ({ request }) => {
        const url = new URL(request.url)
        receivedFilters.push({
          siteId: url.searchParams.get('siteId'),
          status: url.searchParams.get('status'),
        })
        // An employee record carries no site reference at all, so the filtered
        // response is built from the factory defaults regardless of `siteId`.
        return okPageJson([createEmployee()])
      }),
    )

    render(<EmployeesListPage />, { wrapper: createWrapper() })

    await screen.findByText('موظف تجريبي')
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب الموقع' }))
    await user.click(await screen.findByRole('option', { name: site.name }))
    await user.click(screen.getByRole('combobox', { name: 'تصفية حسب حالة الموظف' }))
    await user.click(await screen.findByRole('option', { name: 'غير نشط' }))

    await waitFor(() =>
      expect(receivedFilters).toContainEqual({ siteId: site.id, status: 'Inactive' }),
    )
  })

  it('retries a failed list request through the Arabic error state', async () => {
    let attempts = 0

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([])),
      http.get(`${API_BASE_URL}/employees`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : okPageJson([createEmployee()])
      }),
    )

    render(<EmployeesListPage />, { wrapper: createWrapper({ retry: false }) })

    expect(await screen.findByRole('heading', { name: 'تعذّر تحميل الموظفين' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(attempts).toBe(2))
    expect(await screen.findByText('موظف تجريبي')).toBeInTheDocument()
  })
})
