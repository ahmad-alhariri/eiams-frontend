import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEmployee, createOrganizationalUnit, createPage } from '@/test/msw/factories'
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

import EmployeeDetailPage from './employee-detail-page'

const API_BASE_URL = '/api/v1'
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000035'

function LocationProbe() {
  const { pathname } = useLocation()
  return <p data-testid="location">{pathname}</p>
}

function PageWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter initialEntries={[`/organization/employees/${EMPLOYEE_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/organization/employees/:employeeId" element={children} />
          <Route path="/organization/employees" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

afterEach(() => {
  permissions.canManage = false
})

describe('EmployeeDetailPage', () => {
  it('renders the contract-backed employee profile without management controls', async () => {
    const employee = createEmployee({ jobTitleAr: null, status: 'Inactive' })
    server.use(
      http.get(`${API_BASE_URL}/employees/${employee.employeeId}`, () =>
        HttpResponse.json(employee),
      ),
    )
    render(<EmployeeDetailPage />, { wrapper: PageWrapper })
    expect(await screen.findByRole('heading', { name: employee.fullNameAr })).toBeInTheDocument()
    expect(screen.getByText(employee.employeeNumber)).toBeInTheDocument()
    expect(screen.getByText(employee.orgUnit.displayName)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تعديل الموظف' })).not.toBeInTheDocument()
  })

  it('retries an unavailable employee and provides a return path', async () => {
    const employee = createEmployee()
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/employees/${employee.employeeId}`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(employee)
      }),
    )
    render(<EmployeeDetailPage />, { wrapper: PageWrapper })
    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل الموظف' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(attempts).toBe(2))
    await user.click(screen.getByRole('button', { name: 'العودة إلى الموظفين' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/organization/employees')
  })

  it('saves an edit with the employee row version and an org-unit reference', async () => {
    permissions.canManage = true
    const employee = createEmployee({ rowVersion: 7 })
    const orgUnit = createOrganizationalUnit({ orgUnitId: employee.orgUnit.id })
    const user = userEvent.setup()
    let receivedBody: unknown = null
    server.use(
      http.get(`${API_BASE_URL}/employees/${employee.employeeId}`, () =>
        HttpResponse.json(employee),
      ),
      http.get(`${API_BASE_URL}/organizational-units`, () =>
        HttpResponse.json(createPage([orgUnit])),
      ),
      http.put(`${API_BASE_URL}/employees/${employee.employeeId}`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json(employee)
      }),
    )
    render(<EmployeeDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: employee.fullNameAr })
    await user.click(screen.getByRole('button', { name: 'تعديل الموظف' }))
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByLabelText('اسم الموظف')
    await user.clear(nameInput)
    await user.type(nameInput, 'موظف محدّث')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    await waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({
      employeeNumber: employee.employeeNumber,
      fullNameAr: 'موظف محدّث',
      jobTitleAr: employee.jobTitleAr,
      orgUnitId: employee.orgUnit.id,
      rowVersion: 7,
      status: employee.status,
    })
  })
})
