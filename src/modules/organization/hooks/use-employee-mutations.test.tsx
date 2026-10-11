import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { createEmployee } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useEmployeesQuery, useEmployeeQuery } from './use-organization-queries'
import { useCreateEmployeeMutation, useSetEmployeeStatusMutation } from './use-employee-mutations'

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('employee mutation cache invalidation', () => {
  it('refetches both the list and the detail query after a create', async () => {
    const employee = createEmployee()
    let listRequests = 0
    let detailRequests = 0
    const createBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/employees`, () => {
        listRequests += 1
        return okPageJson([employee], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
      }),
      http.get(`${API_BASE_URL}/employees/${employee.id}`, () => {
        detailRequests += 1
        return okJson(employee)
      }),
      http.post(`${API_BASE_URL}/employees`, async ({ request }) => {
        createBodies.push(await request.json())
        return okJson({ id: employee.id })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useEmployeesQuery({ page: 1, pageSize: 10 }),
        detail: useEmployeeQuery(employee.id),
        create: useCreateEmployeeMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1))
    await waitFor(() => expect(result.current.detail.data?.fullName).toBe(employee.fullName))

    await act(async () => {
      await result.current.create.mutateAsync({
        orgUnitId: employee.orgUnitId,
        fullName: 'Ù…ÙˆØ¸Ù Ø¬Ø¯ÙŠØ¯',
        employeeNumber: 'EMP-NEW',
        jobTitle: null,
      })
    })

    await waitFor(() => expect(listRequests).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(detailRequests).toBeGreaterThanOrEqual(2))
    // `POST /employees` binds orgUnitId / fullName / employeeNumber / jobTitle:
    // no `status` and no concurrency token.
    expect(createBodies).toEqual([
      {
        orgUnitId: employee.orgUnitId,
        fullName: 'Ù…ÙˆØ¸Ù Ø¬Ø¯ÙŠØ¯',
        employeeNumber: 'EMP-NEW',
        jobTitle: null,
      },
    ])
  })

  it('sends an integer status command body in BOTH directions, with no version guard', async () => {
    const employee = createEmployee()
    const statusBodies: unknown[] = []
    let listRequests = 0
    let detailRequests = 0

    server.use(
      http.get(`${API_BASE_URL}/employees`, () => {
        listRequests += 1
        return okPageJson([employee])
      }),
      http.get(`${API_BASE_URL}/employees/${employee.id}`, () => {
        detailRequests += 1
        return okJson(employee)
      }),
      http.put(`${API_BASE_URL}/employees/${employee.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useEmployeesQuery({ page: 1, pageSize: 10 }),
        detail: useEmployeeQuery(employee.id),
        setStatus: useSetEmployeeStatusMutation(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1))
    await waitFor(() => expect(result.current.detail.data?.fullName).toBe(employee.fullName))

    const listRequestsBefore = listRequests
    const detailRequestsBefore = detailRequests

    // Deactivation then reactivation: the SAME route with the other ordinal.
    await act(async () => {
      await result.current.setStatus.mutateAsync({ employeeId: employee.id, status: 'Inactive' })
    })
    await act(async () => {
      await result.current.setStatus.mutateAsync({ employeeId: employee.id, status: 'Active' })
    })

    // `[JsonRequired] int Status`: the ORDINAL, never the status name the read
    // served, and NOTHING else. Employee is not a versioned aggregate, so there
    // is no `expectedRowVersion` to send â€” and the body is
    // `additionalProperties: false`, so sending one would be a 400.
    expect(statusBodies).toEqual([{ status: 1 }, { status: 0 }])
    for (const body of statusBodies) {
      expect(typeof (body as { status: unknown }).status).toBe('number')
      expect(body).not.toHaveProperty('expectedRowVersion')
    }
    await waitFor(() => expect(listRequests).toBeGreaterThan(listRequestsBefore + 1))
    await waitFor(() => expect(detailRequests).toBeGreaterThan(detailRequestsBefore + 1))
  })

  it('skips invalidation entirely while no scope is active', async () => {
    activeScope.key = undefined
    const employee = createEmployee()
    const statusBodies: unknown[] = []

    server.use(
      http.put(`${API_BASE_URL}/employees/${employee.id}/status`, async ({ request }) => {
        statusBodies.push(await request.json())
        return new Response(null, { status: 204 })
      }),
    )

    const { result } = renderHook(() => useSetEmployeeStatusMutation(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ employeeId: employee.id, status: 'Inactive' })
    })

    expect(statusBodies).toEqual([{ status: 1 }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
