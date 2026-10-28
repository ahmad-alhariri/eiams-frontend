import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { setFormServerErrors } from '@/shared/forms/server-errors'
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
