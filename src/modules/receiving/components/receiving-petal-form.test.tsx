import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createReceivingSuppliersHandler } from '@/test/msw/receiving-handlers'
import { server } from '@/test/msw/server'

import {
  ReceivingPetalForm,
  receivingPetalFormSchema,
  type ReceivingPetalFormValues,
} from './receiving-petal-form'

/**
 * The petal writes `ReceivingDraftDetails(SupplierRef, SupplierInvoiceRef)`.
 * `supplierRef` is V1 free text — the supplier NAME — so the combobox commits a
 * suggestion or the typed name on Tab. There is deliberately no `receivingType`
 * control: the backend fixes `ReceivingType.Supplier` server-side.
 */

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

function createWrapper(onSubmit?: (values: ReceivingPetalFormValues) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function PetalWrapper() {
    const form = useForm<ReceivingPetalFormValues>({
      resolver: zodResolver(receivingPetalFormSchema),
      defaultValues: {
        petal: {
          receivingInfo: { supplierRef: '', supplierInvoiceRef: '' },
        },
      },
    })
    return (
      <QueryClientProvider client={client}>
        <FormProvider {...form}>
          <form
            onSubmit={(event) => void form.handleSubmit((values) => onSubmit?.(values))(event)}
            noValidate
          >
            <ReceivingPetalForm />
            <button type="submit">حفظ</button>
          </form>
        </FormProvider>
      </QueryClientProvider>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('ReceivingPetalForm', () => {
  it('renders only the two controls the live write carries', () => {
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    expect(screen.getByRole('group', { name: 'بيانات الاستلام' })).toBeInTheDocument()
    expect(screen.getByLabelText('المورد')).toBeInTheDocument()
    expect(screen.getByLabelText('رقم فاتورة المورد')).toBeInTheDocument()
    // No receiving-type control: the server fixes it to `Supplier` for every
    // receiving draft, so a control here would validate a value that reaches no
    // server state.
    expect(screen.queryByLabelText('نوع الاستلام')).not.toBeInTheDocument()
  })

  it('shows the Arabic validation error when no supplier is selected', async () => {
    const user = userEvent.setup()
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(await screen.findByText('اسم المورد مطلوب.')).toBeInTheDocument()
  })

  it('selects a supplier suggestion and accepts an optional invoice reference', async () => {
    const user = userEvent.setup()
    server.use(...createReceivingSuppliersHandler(['Sham Co', 'Noor Co']))
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    const supplierCombo = screen.getByRole('combobox', { name: 'المورد' })
    await user.click(supplierCombo)
    await user.type(supplierCombo, 'Sha')
    await user.click(await screen.findByRole('option', { name: 'Sham Co' }))
    await user.type(screen.getByLabelText('رقم فاتورة المورد'), 'INV-2025-01')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(screen.queryByText('اسم المورد مطلوب.')).not.toBeInTheDocument()
  })

  it('commits a typed supplier NAME on Tab and submits it as supplierRef', async () => {
    const user = userEvent.setup()
    const submitted: ReceivingPetalFormValues[] = []
    server.use(...createReceivingSuppliersHandler(['Sham Co']))
    render(<ReceivingPetalForm />, { wrapper: createWrapper((values) => submitted.push(values)) })

    const supplierCombo = screen.getByRole('combobox', { name: 'المورد' })
    await user.type(supplierCombo, 'NewProvider')
    // Tab commits the typed name as free text, so the suggestion list does not
    // have to carry a supplier the keeper already knows.
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(screen.queryByText('اسم المورد مطلوب.')).not.toBeInTheDocument()
    expect(submitted).toHaveLength(1)
    expect(submitted[0]?.petal.receivingInfo.supplierRef).toBe('NewProvider')
  })

  it('commits the typed supplier NAME on blur so Save works without Tab', async () => {
    const user = userEvent.setup()
    const submitted: ReceivingPetalFormValues[] = []
    server.use(...createReceivingSuppliersHandler(['Sham Co']))
    render(<ReceivingPetalForm />, { wrapper: createWrapper((values) => submitted.push(values)) })

    const supplierCombo = screen.getByRole('combobox', { name: 'المورد' })
    await user.type(supplierCombo, '  NewProvider  ')
    // Blur alone (no Tab, no suggestion) must bind the trimmed typed name;
    // submitting the form directly keeps the pointer from blurring the input.
    fireEvent.blur(supplierCombo)
    fireEvent.submit(screen.getByText('حفظ').closest('form')!)

    await waitFor(() => expect(submitted).toHaveLength(1))
    expect(screen.queryByText('اسم المورد مطلوب.')).not.toBeInTheDocument()
    expect(submitted[0]?.petal.receivingInfo.supplierRef).toBe('NewProvider')
  })

  it('keeps the clicked suggestion when the typed query also blurs', async () => {
    const user = userEvent.setup()
    const submitted: ReceivingPetalFormValues[] = []
    server.use(...createReceivingSuppliersHandler(['Sham Co']))
    render(<ReceivingPetalForm />, { wrapper: createWrapper((values) => submitted.push(values)) })

    const supplierCombo = screen.getByRole('combobox', { name: 'المورد' })
    await user.type(supplierCombo, 'Sham')
    await user.click(await screen.findByRole('option', { name: 'Sham Co' }))
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]?.petal.receivingInfo.supplierRef).toBe('Sham Co')
  })

  it('disables the supplier autocomplete until a scope is active', () => {
    activeScope.key = undefined
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    expect(screen.getByRole('combobox', { name: 'المورد' })).toBeDisabled()
  })
})
