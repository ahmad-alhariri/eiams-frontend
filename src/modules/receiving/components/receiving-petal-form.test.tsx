import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen } from '@testing-library/react'
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
 * The petal writes `ReceivingDraftDetails(SupplierPartyId, SupplierInvoiceRef)`.
 * There is deliberately no `receivingType` control (the backend fixes
 * `ReceivingType.Supplier` server-side) and no free-text "create supplier" row
 * (a typed name has no external-party id, so committing it would save a draft the
 * server cannot bind). Both controls here are the ones the real write carries.
 */

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function PetalWrapper() {
    const form = useForm<ReceivingPetalFormValues>({
      resolver: zodResolver(receivingPetalFormSchema),
      defaultValues: {
        petal: {
          receivingInfo: { supplierPartyId: '', supplierInvoiceRef: '' },
        },
      },
    })
    return (
      <QueryClientProvider client={client}>
        <FormProvider {...form}>
          <form onSubmit={(event) => void form.handleSubmit(() => undefined)(event)} noValidate>
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

    expect(await screen.findByText('يجب اختيار مورد صالح من القائمة.')).toBeInTheDocument()
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

    expect(screen.queryByText('يجب اختيار مورد صالح من القائمة.')).not.toBeInTheDocument()
  })

  it('offers no free-text create row: a typed name carries no external-party id', async () => {
    const user = userEvent.setup()
    server.use(...createReceivingSuppliersHandler(['Sham Co']))
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    const supplierCombo = screen.getByRole('combobox', { name: 'المورد' })
    await user.click(supplierCombo)
    await user.type(supplierCombo, 'NewProvider')

    expect(
      screen.queryByRole('button', { name: 'استخدام "NewProvider" كمورد' }),
    ).not.toBeInTheDocument()
  })

  it('disables the supplier autocomplete until a scope is active', () => {
    activeScope.key = undefined
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    expect(screen.getByRole('combobox', { name: 'المورد' })).toBeDisabled()
  })
})
