import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { setFormServerErrors, submitWithServerErrors } from '@/shared/forms/server-errors'
import type { FieldError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

interface DemoValues {
  fullName: string
  email: string
}

const serverErrors: readonly FieldError[] = [
  { code: 'DuplicateEmail', field: 'email', messageAr: 'البريد الإلكتروني مسجل مسبقاً' },
]

/**
 * A form whose save FAILED: the submit maps the contract field error onto the
 * field through the shared helper, exactly as every production form does when
 * the API rejects the write.
 *
 * The submit deliberately does not go through `handleSubmit`: react-hook-form
 * only re-validates a changed field after one, so a server error that lands
 * without one used to sit on screen until the next save. The shared helper
 * owns the clearing, so the helper is what this form exercises.
 */
function FailedSaveForm() {
  const form = useForm<DemoValues>({ defaultValues: { fullName: '', email: '' } })
  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          setFormServerErrors(form, serverErrors)
        }}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>البريد الإلكتروني</FormLabel>
              <FormControl>
                <Input placeholder="أدخل البريد" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>الاسم الكامل</FormLabel>
              <FormControl>
                <Input placeholder="أدخل الاسم" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">حفظ</Button>
      </form>
    </Form>
  )
}

describe('setFormServerErrors', () => {
  it('clears the stale server field error once the user corrects that field', async () => {
    const user = userEvent.setup()
    render(<FailedSaveForm />)

    await user.click(screen.getByRole('button', { name: 'حفظ' }))
    expect(await screen.findByText('البريد الإلكتروني مسجل مسبقاً')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }), 'ahmad@example.com')

    // The message is gone on the correction itself — no second save.
    await waitFor(() => {
      expect(screen.queryByText('البريد الإلكتروني مسجل مسبقاً')).not.toBeInTheDocument()
    })
  })

  it('keeps the server field error while that field is untouched', async () => {
    const user = userEvent.setup()
    render(<FailedSaveForm />)

    await user.click(screen.getByRole('button', { name: 'حفظ' }))
    expect(await screen.findByText('البريد الإلكتروني مسجل مسبقاً')).toBeInTheDocument()

    // Another field changed: the rejected field still carries the server message.
    await user.type(screen.getByRole('textbox', { name: 'الاسم الكامل' }), 'أحمد علي')

    expect(screen.getByText('البريد الإلكتروني مسجل مسبقاً')).toBeInTheDocument()
  })
})

/** A rejected write in the REAL backend envelope: `error.details` holds the model-binding map. */
function rejectedWrite(field: string): AxiosError<unknown> {
  return new AxiosError(
    'Request failed with status code 400',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      data: {
        success: false as const,
        error: {
          code: 'REQUEST_VALIDATION_FAILED',
          message: 'One or more request values are invalid.',
          details: { [`body.${field}`]: ['The field is required.'] },
          request_id: '0f9a3c2e-0000-4000-8000-000000000001',
        },
      },
      status: 400,
      statusText: '',
      headers: {},
      config: { headers: {} as never },
    },
  )
}

describe('submitWithServerErrors', () => {
  it('runs the submit and leaves no field error when it succeeds', async () => {
    const { result } = renderHook(() =>
      useForm<DemoValues>({ defaultValues: { fullName: '', email: '' } }),
    )
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    await submitWithServerErrors(result.current, result.current.getValues(), onSubmit)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(result.current.getFieldState('email').error).toBeUndefined()
  })

  it('maps a rejected write onto the field the dialog owns', async () => {
    const { result } = renderHook(() =>
      useForm<DemoValues>({ defaultValues: { fullName: '', email: '' } }),
    )

    await submitWithServerErrors(
      result.current,
      result.current.getValues(),
      async () => {
        throw rejectedWrite('email')
      },
      ['email'],
    )

    await waitFor(() => {
      expect(result.current.getFieldState('email').error?.message).toBeTruthy()
    })
    // The wire message is English; only the approved Arabic copy may reach the field.
    expect(result.current.getFieldState('email').error?.message).not.toContain('required')
  })

  it('skips a field the dialog does not own', async () => {
    const { result } = renderHook(() =>
      useForm<DemoValues>({ defaultValues: { fullName: '', email: '' } }),
    )

    await submitWithServerErrors(
      result.current,
      result.current.getValues(),
      async () => {
        throw rejectedWrite('fullName')
      },
      ['email'],
    )

    expect(result.current.getFieldState('fullName').error).toBeUndefined()
    // The same payload IS mapped when the dialog owns the field, so the
    // allow-list is what suppressed it - not an empty payload.
    await submitWithServerErrors(
      result.current,
      result.current.getValues(),
      async () => {
        throw rejectedWrite('fullName')
      },
      ['fullName'],
    )
    await waitFor(() => {
      expect(result.current.getFieldState('fullName').error?.message).toBeTruthy()
    })
  })

  it('clears the errors of the previous attempt before the submit', async () => {
    const { result } = renderHook(() =>
      useForm<DemoValues>({ defaultValues: { fullName: '', email: '' } }),
    )
    result.current.setError('email', { message: 'stale' })
    await waitFor(() => {
      expect(result.current.getFieldState('email').error?.message).toBe('stale')
    })

    await submitWithServerErrors(result.current, result.current.getValues(), async () => {})

    await waitFor(() => {
      expect(result.current.getFieldState('email').error).toBeUndefined()
    })
  })
})
