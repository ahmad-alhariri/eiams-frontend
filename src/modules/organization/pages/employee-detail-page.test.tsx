import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { okJson, okPageJson } from '@/test/msw/envelope'
import { createEmployee, createOrganizationalUnit } from '@/test/msw/factories'
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
    const employee = createEmployee({ jobTitle: null, status: 'Inactive' })
    // The unit label is joined from `employee.orgUnitId` against this list —
    // the projection carries no nested `orgUnit`.
    const orgUnit = createOrganizationalUnit({ id: employee.orgUnitId })

    server.use(
      http.get(`${API_BASE_URL}/employees/${employee.id}`, () => okJson(employee)),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([orgUnit])),
    )

    render(<EmployeeDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: employee.fullName })).toBeInTheDocument()
    expect(screen.getByText(`الرقم الوظيفي: ${employee.employeeNumber}`)).toBeInTheDocument()
    expect(await screen.findByText(orgUnit.name)).toBeInTheDocument()
    // There is deliberately NO "الموقع" field: the employee projection serves no
    // site reference, so no site name can be derived from this record.
    expect(screen.queryByText('الموقع')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تعديل الموظف' })).not.toBeInTheDocument()
  })

  it('falls back to a dash when the employee unit is absent from the loaded units', async () => {
    const employee = createEmployee()

    server.use(
      http.get(`${API_BASE_URL}/employees/${employee.id}`, () => okJson(employee)),
      // An unrelated unit: the join by `orgUnitId` misses.
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([])),
    )

    render(<EmployeeDetailPage />, { wrapper: PageWrapper })

    expect(await screen.findByRole('heading', { name: employee.fullName })).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('retries an unavailable employee and provides a return path', async () => {
    const employee = createEmployee()
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/employees/${employee.id}`, () => {
        attempts += 1
        return attempts === 1 ? new HttpResponse(null, { status: 500 }) : okJson(employee)
      }),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([])),
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

  it('saves an edit with only the fields the update body binds', async () => {
    permissions.canManage = true
    // Employee serves no row version and cannot be re-assigned to another unit
    // through this API, so neither appears in the update body.
    const employee = createEmployee()
    const orgUnit = createOrganizationalUnit({ id: employee.orgUnitId })
    const user = userEvent.setup()
    let receivedBody: unknown = null
    server.use(
      http.get(`${API_BASE_URL}/employees/${employee.id}`, () => okJson(employee)),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([orgUnit])),
      http.put(`${API_BASE_URL}/employees/${employee.id}`, async ({ request }) => {
        receivedBody = await request.json()
        // `PUT /employees/{id}` answers with an empty body.
        return new HttpResponse(null, { status: 204 })
      }),
    )
    render(<EmployeeDetailPage />, { wrapper: PageWrapper })
    await screen.findByRole('heading', { name: employee.fullName })
    await user.click(screen.getByRole('button', { name: 'تعديل الموظف' }))
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByLabelText('اسم الموظف')
    await user.clear(nameInput)
    await user.type(nameInput, 'موظف محدّث')
    // `employeeNumber` and `orgUnitId` bind only to POST, so they render
    // disabled on edit and `toUpdateEmployeeRequest` drops them.
    expect(within(dialog).getByLabelText('الرقم الوظيفي')).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    await waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({
      fullName: 'موظف محدّث',
      jobTitle: employee.jobTitle,
    })
  })
})
