import { AxiosError, AxiosHeaders } from 'axios'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmployeeFormDialog } from './employee-form-dialog'

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

describe('EmployeeFormDialog server-error contract', () => {
  it('renders a contract field error inline in Arabic', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(serverError(400, 'VALIDATION_FAILED', { fullName: ['required'] }))
    render(
      <EmployeeFormDialog
        open
        employee={null}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.type(screen.getByLabelText('الاسم الكامل'), 'x')
    await user.click(screen.getByRole('button', { name: /حفظ/i }))
    await waitFor(() =>
      expect(screen.getByLabelText('الاسم الكامل')).toHaveAttribute('aria-invalid', 'true'),
    )
  })

  it('keeps previous generic-error outcome when no field errors map', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(serverError(500, 'INTERNAL_ERROR'))
    render(
      <EmployeeFormDialog
        open
        employee={null}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.type(screen.getByLabelText('الاسم الكامل'), 'x')
    await user.click(screen.getByRole('button', { name: /حفظ/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
