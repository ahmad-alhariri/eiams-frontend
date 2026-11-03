import axios from 'axios'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MaterialFamilyFormDialog } from './material-family-form-dialog'

function fieldErrorAxiosError(fieldPath: string) {
  return new axios.AxiosError('bad', 'ERR_BAD_REQUEST', { url: '/', headers: {} }, undefined, {
    status: 400,
    statusText: 'Bad Request',
    headers: undefined,
    config: { url: '/', headers: {} },
    data: {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'bad',
        details: { [fieldPath]: ['required'] },
        request_id: 't1',
      },
    },
  } as unknown as axios.AxiosResponse<any>)
}

describe('MaterialFamilyFormDialog server-error contract', () => {
  it('renders a contract field error inline in Arabic', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(fieldErrorAxiosError('name'))
    render(
      <MaterialFamilyFormDialog
        open
        family={null}
        categories={[]}
        isCategoriesLoading={false}
        isCategoriesError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.type(screen.getByLabelText('اسم العائلة'), 'x')
    await user.click(screen.getByRole('button', { name: /حفظ/i }))
    await waitFor(() =>
      expect(screen.getByLabelText('اسم العائلة')).toHaveAttribute('aria-invalid', 'true'),
    )
  })

  it('keeps previous generic-error outcome when no field errors map', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(
      new axios.AxiosError('bad', 'ERR_BAD_REQUEST', { url: '/', headers: {} }, undefined, {
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
      } as unknown as axios.AxiosResponse<any>),
    )
    render(
      <MaterialFamilyFormDialog
        open
        family={null}
        categories={[]}
        isCategoriesLoading={false}
        isCategoriesError={false}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.type(screen.getByLabelText('اسم العائلة'), 'x')
    await user.click(screen.getByRole('button', { name: /حفظ/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
