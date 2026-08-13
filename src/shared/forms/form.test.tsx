import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/forms/form'
import { fieldErrorsToMap, setFormServerErrors } from '@/shared/forms/server-errors'
import type { FieldError } from '@/shared/types/generated/eiams-v1'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const demoSchema = z.object({
  fullName: z.string().min(2, 'الاسم حرفان على الأقل'),
  email: z.email('البريد الإلكتروني غير صحيح'),
})

type DemoSchemaValues = z.infer<typeof demoSchema>

interface DemoFormProps {
  onSubmit: (values: DemoSchemaValues) => void
  showDescription?: boolean
}

function DemoForm({ onSubmit, showDescription = false }: DemoFormProps) {
  const form = useForm<DemoSchemaValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: { fullName: '', email: '' },
  })
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>الاسم الكامل</FormLabel>
              <FormControl>
                <Input placeholder="أدخل الاسم" {...field} />
              </FormControl>
              {showDescription ? <FormDescription>يُستخدم في بطاقات العهد.</FormDescription> : null}
              <FormMessage />
            </FormItem>
          )}
        />
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
        <Button type="submit">حفظ</Button>
      </form>
    </Form>
  )
}

const serverErrors: readonly FieldError[] = [
  { code: 'DuplicateEmail', field: 'email', messageAr: 'البريد الإلكتروني مسجل مسبقاً' },
  { code: 'UnknownKey', field: 'unknownField', messageAr: 'لا يُطبَّق على هذا النموذج' },
]

function ServerErrorsForm() {
  const form = useForm<DemoSchemaValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: { fullName: '', email: '' },
  })
  return (
    <Form {...form}>
      <div>
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
        <Button type="button" onClick={() => setFormServerErrors(form, serverErrors)}>
          محاكاة أخطاء الخادم
        </Button>
      </div>
    </Form>
  )
}

const nestedSchema = z.object({
  user: z.object({
    fullName: z.string().min(2, 'الاسم حرفان على الأقل'),
  }),
})

type NestedValues = z.infer<typeof nestedSchema>

function NestedTypedForm() {
  const form = useForm<NestedValues>({
    resolver: zodResolver(nestedSchema),
    defaultValues: { user: { fullName: '' } },
  })
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="user.fullName"
        render={({ field, formState }) => {
          const typedValue: string = field.value
          const typedPath: 'user.fullName' = field.name
          const hasNestedError = formState.errors.user?.fullName !== undefined
          return (
            <p data-testid="nested-probe">
              {JSON.stringify({ typedValue, typedPath, hasNestedError })}
            </p>
          )
        }}
      />
    </Form>
  )
}

function DisabledReadOnlyForm() {
  const form = useForm<DemoSchemaValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: { fullName: '', email: '' },
  })
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="fullName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>الاسم الكامل</FormLabel>
            <FormControl>
              <Input {...field} disabled readOnly />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  )
}

function RequiredRulesForm() {
  const form = useForm<DemoSchemaValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: { fullName: '', email: '' },
  })
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="fullName"
        rules={{ required: true }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>الاسم الكامل</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  )
}

describe('Form bridge (Form/FormField/FormItem/FormControl)', () => {
  it('ties FormLabel to its FormControl through a generated id', () => {
    render(<DemoForm onSubmit={vi.fn()} />)

    const input = screen.getByRole('textbox', { name: 'الاسم الكامل' })
    const label = screen.getByText('الاسم الكامل')

    expect(label).toHaveAttribute('data-slot', 'label')
    expect(label).toHaveAttribute('for', input.id)
  })

  it('renders the inline Arabic Zod message and marks the control invalid after an invalid submit', async () => {
    const user = userEvent.setup()
    render(<DemoForm onSubmit={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    const nameMessage = await screen.findByText('الاسم حرفان على الأقل')
    expect(screen.getByText('البريد الإلكتروني غير صحيح')).toBeInTheDocument()

    const nameInput = screen.getByRole('textbox', { name: 'الاسم الكامل' })
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameMessage).toHaveAttribute('aria-live', 'polite')
    expect(nameInput).toHaveAttribute('aria-describedby', nameMessage.id)
  })

  it('submits valid values to onSubmit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<DemoForm onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox', { name: 'الاسم الكامل' }), 'أحمد علي')
    await user.type(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }), 'ahmad@example.com')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({
        fullName: 'أحمد علي',
        email: 'ahmad@example.com',
      })
    })
  })

  it('links description and message ids through aria-describedby when both exist', async () => {
    const user = userEvent.setup()
    render(<DemoForm onSubmit={vi.fn()} showDescription />)

    const input = screen.getByRole('textbox', { name: 'الاسم الكامل' })
    const description = screen.getByText('يُستخدم في بطاقات العهد.')

    expect(description).toHaveAttribute('data-slot', 'form-description')
    expect(input).toHaveAttribute('aria-describedby', description.id)

    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    const message = await screen.findByText('الاسم حرفان على الأقل')
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? []
    expect(describedBy).toEqual(expect.arrayContaining([description.id, message.id]))
  })

  it('lands server FieldError entries as inline Arabic messages and skips unknown keys', async () => {
    const user = userEvent.setup()
    render(<ServerErrorsForm />)

    expect(document.querySelector('[data-slot="form-message"]')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'محاكاة أخطاء الخادم' }))

    expect(await screen.findByText('البريد الإلكتروني مسجل مسبقاً')).toBeInTheDocument()
    expect(screen.queryByText('لا يُطبَّق على هذا النموذج')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'البريد الإلكتروني' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('flattens server FieldError entries into a field-keyed map', () => {
    expect(fieldErrorsToMap(serverErrors)).toEqual({
      email: 'البريد الإلكتروني مسجل مسبقاً',
      unknownField: 'لا يُطبَّق على هذا النموذج',
    })
    expect(fieldErrorsToMap(null)).toEqual({})
    expect(fieldErrorsToMap(undefined)).toEqual({})
  })

  it('keeps nested field values typed through PathValue', () => {
    render(<NestedTypedForm />)

    expect(screen.getByTestId('nested-probe')).toHaveTextContent('"user.fullName"')
  })

  it('preserves disabled and readOnly props on the composed control', () => {
    render(<DisabledReadOnlyForm />)

    const input = screen.getByRole('textbox', { name: 'الاسم الكامل' })
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('readonly')
  })

  it('surfaces aria-required when rules declare the field required', () => {
    render(<RequiredRulesForm />)

    expect(screen.getByRole('textbox', { name: 'الاسم الكامل' })).toHaveAttribute(
      'aria-required',
      'true',
    )
  })

  it('renders no message element while the field has no error', () => {
    render(<DemoForm onSubmit={vi.fn()} />)

    expect(document.querySelector('[data-slot="form-message"]')).not.toBeInTheDocument()
  })
})
