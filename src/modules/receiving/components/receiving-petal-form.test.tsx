import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Resolver } from 'react-hook-form'
import { FormProvider, useForm } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createReceivingSuppliersHandler } from '@/test/msw/receiving-handlers'
import { server } from '@/test/msw/server'

import { ReceivingPetalForm, receivingPetalFormSchema } from './receiving-petal-form'

type PetalFormValues = {
  petal: {
    receivingInfo: { receivingType: string; supplierRef: string; supplierInvoiceRef?: string }
  }
}

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
    const form = useForm<PetalFormValues>({
      resolver: zodResolver(receivingPetalFormSchema) as Resolver<PetalFormValues>,
      defaultValues: {
        petal: {
          receivingInfo: { receivingType: 'Supplier', supplierRef: '', supplierInvoiceRef: '' },
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
  it('renders the receiving type select with the PRD trio and the supplier fields', () => {
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    expect(screen.getByRole('group', { name: 'بيانات الاستلام' })).toBeInTheDocument()
    expect(screen.getByLabelText('نوع الاستلام')).toBeInTheDocument()
    expect(screen.getByLabelText('المورد')).toBeInTheDocument()
    expect(screen.getByLabelText('رقم فاتورة المورد')).toBeInTheDocument()

    const typeTrigger = screen.getByLabelText('نوع الاستلام')
    expect(typeTrigger).toHaveTextContent('توريد من مورد')
  })

  it('offers the three PRD receiving types', async () => {
    const user = userEvent.setup()
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    await user.click(screen.getByLabelText('نوع الاستلام'))
    expect(screen.getByRole('option', { name: 'توريد من مورد' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'تحويل من مستودع' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'إرجاع بضاعة' })).toBeInTheDocument()
  })

  it('shows Arabic validation errors when the required petal fields are empty', async () => {
    const user = userEvent.setup()
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    await user.type(screen.getByLabelText('المورد'), '   ')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(await screen.findByText('يجب إدخال اسم أو مرجع المورد.')).toBeInTheDocument()
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

    expect(screen.queryByText('يجب إدخال اسم أو مرجع المورد.')).not.toBeInTheDocument()
  })

  it('commits a typed free-text supplier reference through the create row', async () => {
    const user = userEvent.setup()
    server.use(...createReceivingSuppliersHandler(['Sham Co']))
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    const supplierCombo = screen.getByRole('combobox', { name: 'المورد' })
    await user.click(supplierCombo)
    await user.type(supplierCombo, 'NewProvider')
    await user.click(await screen.findByRole('button', { name: 'استخدام "NewProvider" كمورد' }))
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(screen.queryByText('يجب إدخال اسم أو مرجع المورد.')).not.toBeInTheDocument()
  })

  it('disables the supplier autocomplete until a scope is active', () => {
    activeScope.key = undefined
    render(<ReceivingPetalForm />, { wrapper: createWrapper() })

    expect(screen.getByRole('combobox', { name: 'المورد' })).toBeDisabled()
  })
})
