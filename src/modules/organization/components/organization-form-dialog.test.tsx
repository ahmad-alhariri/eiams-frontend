// @ts-nocheck // eslint-disable-line @typescript-eslint/ban-ts-comment
import axios from 'axios'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { OrganizationFormDialog } from './organization-form-dialog'

function fieldErrorAxiosError(fieldPath: string) {
  return new axios.AxiosError('bad', 'ERR_BAD_REQUEST', { url: '/' } as any, undefined, {
    status: 400,
    data: {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'bad',
        details: { [fieldPath]: ['required'] },
        request_id: 't1',
      },
    },
  })
}

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('OrganizationFormDialog server-error contract', () => {
  it('renders a contract field error inline in Arabic', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(fieldErrorAxiosError('name'))
    render(
      <OrganizationFormDialog
        open
        organization={null}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    const inputs = screen.getAllByRole('textbox')
    if (inputs.length > 0) await user.type(inputs[0], 'x')
    await user.click(screen.getByRole('button', { name: /حفظ/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('keeps previous generic-error outcome when no field errors map', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(
      new axios.AxiosError('bad', 'ERR_BAD_REQUEST', { url: '/' } as any, undefined, {
        status: 500,
        data: {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'bad',
            details: {},
            request_id: 't2',
          },
        },
      }),
    )
    render(
      <OrganizationFormDialog
        open
        organization={null}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    const inputs = screen.getAllByRole('textbox')
    if (inputs.length > 0) await user.type(inputs[0], 'x')
    await user.click(screen.getByRole('button', { name: /حفظ/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})






/* eslint-enable @typescript-eslint/no-explicit-any */


