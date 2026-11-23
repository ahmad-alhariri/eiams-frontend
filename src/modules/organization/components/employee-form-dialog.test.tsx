import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmployeeFormDialog } from './employee-form-dialog'
import { createEmployee, createOrganizationalUnit, fixtureUuid } from '@/test/msw/factories'
import { okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  // No scope by default: the two edit-mode tests below are about server field
  // errors and must keep the reference query disabled, as before this suite was
  // given a scope mock. The create-mode test opts in explicitly.
  key: undefined as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

afterEach(() => {
  activeScope.key = undefined
})

/**
 * `normalizeApiError` renders the APPROVED Arabic for the operation's code
 * (`REQUEST_VALIDATION_FAILED`, see `src/shared/api/error-copy-ar.ts`), never the
 * English wire text, so every mapped field carries this exact sentence.
 */
const FIELD_ERROR_AR = 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.'

function serverError(status: number, code: string, details?: Record<string, unknown>) {
  return new AxiosError('server message', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    data: {
      success: false,
      error: {
        code,
        message: 'server message',
        details: details ?? {},
        request_id: 'req-1',
      },
    },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  })
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

async function expectInlineFieldError(label: string) {
  const field = screen.getByLabelText(label)
  await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
  await waitFor(() => {
    const messageId = field.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(messageId)?.textContent).toBe(FIELD_ERROR_AR)
  })
}

describe('EmployeeFormDialog server-error contract', () => {
  // Edit mode over a seeded employee: a create form additionally requires an
  // organizational unit picked from the reference query, and no scope is cached
  // here, so the query is disabled and the create submit gate stays shut.
  const employee = createEmployee()

  it('renders a contract field error inline in Arabic', async () => {
    const user = userEvent.setup()
    const onSubmit = vi
      .fn()
      .mockRejectedValue(serverError(400, 'REQUEST_VALIDATION_FAILED', { fullName: ['required'] }))
    render(
      <EmployeeFormDialog
        open
        employee={employee}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
      { wrapper: createWrapper() },
    )
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await expectInlineFieldError('اسم الموظف')
  })

  it('keeps previous generic-error outcome when no field errors map', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(serverError(500, 'INTERNAL_ERROR'))
    render(
      <EmployeeFormDialog
        open
        employee={employee}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
      { wrapper: createWrapper() },
    )
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('اسم الموظف')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(FIELD_ERROR_AR)).not.toBeInTheDocument()
  })

  it('offers only Active organizational units as assignment targets', async () => {
    activeScope.key = { kind: 'enterprise' }
    const user = userEvent.setup()
    const active = createOrganizationalUnit({
      id: fixtureUuid(60),
      name: 'وحدة نشطة للتعيين',
    })
    const inactive = createOrganizationalUnit({
      id: fixtureUuid(61),
      name: 'وحدة معطلة للتعيين',
      status: 'Inactive',
    })
    let receivedStatus: string | null = null

    server.use(
      http.get('/api/v1/organizational-units', ({ request }) => {
        receivedStatus = new URL(request.url).searchParams.get('status')
        // Deliberately returns an inactive row: the display must not trust an
        // over-broad cached page even though the query asks the backend for Active.
        return okPageJson([active, inactive])
      }),
    )

    render(
      <EmployeeFormDialog
        open
        employee={null}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(receivedStatus).toBe('Active'))
    await user.click(await screen.findByRole('combobox', { name: 'الوحدة التنظيمية' }))

    expect(await screen.findByRole('option', { name: /وحدة نشطة للتعيين/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /وحدة معطلة للتعيين/ })).not.toBeInTheDocument()
  })
})
