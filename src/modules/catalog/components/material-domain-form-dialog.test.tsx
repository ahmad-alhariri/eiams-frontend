import { AxiosError, AxiosHeaders } from 'axios'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MaterialDomainFormDialog } from './material-domain-form-dialog'

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

async function expectInlineFieldError(label: string) {
  const field = screen.getByLabelText(label)
  await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
  await waitFor(() => {
    const messageId = field.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(messageId)?.textContent).toBe(FIELD_ERROR_AR)
  })
}

describe('MaterialDomainFormDialog server-error contract', () => {
  it('renders a contract field error inline in Arabic', async () => {
    const user = userEvent.setup()
    const onSubmit = vi
      .fn()
      .mockRejectedValue(serverError(400, 'REQUEST_VALIDATION_FAILED', { name: ['required'] }))
    render(
      <MaterialDomainFormDialog
        open
        domain={null}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    // Create mode: both required fields must pass the client rules first, so the
    // assertion can only be satisfied by the server's field error.
    await user.type(screen.getByLabelText('اسم المجال'), 'مجال اختبار')
    await user.type(screen.getByLabelText('رمز المجال'), 'DOM')
    await user.click(screen.getByRole('button', { name: 'إضافة المجال' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await expectInlineFieldError('اسم المجال')
  })

  it('keeps previous generic-error outcome when no field errors map', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(serverError(500, 'INTERNAL_ERROR'))
    render(
      <MaterialDomainFormDialog
        open
        domain={null}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.type(screen.getByLabelText('اسم المجال'), 'مجال اختبار')
    await user.type(screen.getByLabelText('رمز المجال'), 'DOM')
    await user.click(screen.getByRole('button', { name: 'إضافة المجال' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('اسم المجال')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(FIELD_ERROR_AR)).not.toBeInTheDocument()
  })
})
