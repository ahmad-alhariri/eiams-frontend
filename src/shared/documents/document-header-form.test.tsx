import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode } from 'react'
import { useForm, type Resolver, type UseFormReturn } from 'react-hook-form'
import { FormProvider } from 'react-hook-form'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { z } from 'zod'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { createPage } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  documentHeaderSchema,
  DocumentHeaderSection,
  type DocumentHeaderContainer,
} from './document-header-form'

const API_BASE_URL = '/api/v1'

function createTestHost(): {
  host: (children: (form: UseFormReturn<DocumentHeaderContainer>) => ReactNode) => ReactNode
} {
  function Host({
    children,
  }: {
    children: (form: UseFormReturn<DocumentHeaderContainer>) => ReactNode
  }) {
    const form = useForm<DocumentHeaderContainer>({
      resolver: zodResolver(
        z.object({ header: documentHeaderSchema }),
      ) as Resolver<DocumentHeaderContainer>,
      defaultValues: {
        header: { warehouseId: '', paperDocumentNumber: '' },
      },
    })
    return (
      <QueryClientProvider client={createQueryClient()}>
        <FormProvider {...form}>
          <form aria-label="test-form" onSubmit={(event) => event.preventDefault()}>
            {children(form)}
          </form>
        </FormProvider>
      </QueryClientProvider>
    )
  }
  return { host: (children) => <Host children={children} /> }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  server.resetHandlers()
})

describe('DocumentHeaderSection', () => {
  it('renders the spine fields with Arabic labels and the meta row', () => {
    const { host } = createTestHost()
    render(
      host(() => (
        <DocumentHeaderSection
          documentType="Receiving"
          initialValues={{ createdByDisplayName: 'مريم حمادة', rowVersion: 3 }}
        />
      )),
    )

    expect(screen.getByLabelText('المستودع')).toBeInTheDocument()
    expect(screen.getByLabelText('رقم المستند الورقي')).toBeInTheDocument()
    expect(screen.getByLabelText('السنة الورقية')).toBeInTheDocument()
    expect(screen.getByText('نوع المستند')).toBeInTheDocument()
    expect(screen.getByText('إيصال استلام')).toBeInTheDocument()
    expect(screen.getByText('أنشأها')).toBeInTheDocument()
    expect(screen.getByText('مريم حمادة')).toBeInTheDocument()
    expect(screen.getByText('الإصدار: 3')).toBeInTheDocument()
  })

  it('disables the warehouse control until the active scope is ready', () => {
    activeScope.key = undefined
    const { host } = createTestHost()
    render(host(() => <DocumentHeaderSection documentType="Issue" />))

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('enables the warehouse control once the scope is ready', async () => {
    const { host } = createTestHost()
    server.use(http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([]))))
    render(host(() => <DocumentHeaderSection documentType="Issue" />))

    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled())
  })

  it('renders the petal slot for petal-backed types', () => {
    const { host } = createTestHost()
    render(
      host(() => (
        <DocumentHeaderSection
          documentType="Transfer"
          petalSlot={<div data-testid="petal-slot-marker">بيانات الوجهة</div>}
        />
      )),
    )

    expect(screen.getByTestId('petal-slot-marker')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('renders a note instead of a petal slot for petal-less types', () => {
    const { host } = createTestHost()
    render(host(() => <DocumentHeaderSection documentType="Opening" />))

    expect(screen.getByRole('note')).toHaveTextContent('لا تتطلب هذه الوثيقة بيانات إضافية')
  })

  it('renders plain text rows instead of inputs in readOnly mode', () => {
    activeScope.key = undefined
    const { host } = createTestHost()
    render(
      host(() => (
        <DocumentHeaderSection
          documentType="Receiving"
          readOnly
          initialValues={{ warehouseDisplayName: 'المستودع المركزي' }}
        />
      )),
    )

    expect(document.querySelector('[data-slot="document-header-values"]')).toBeInTheDocument()
    expect(screen.getByText('المستودع المركزي')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('رقم المستند الورقي')).not.toBeInTheDocument()
  })

  it('surfaces the Arabic validation message for an invalid paper number', async () => {
    const { host } = createTestHost()
    let form: UseFormReturn<DocumentHeaderContainer> | undefined
    render(
      host((currentForm) => {
        form = currentForm
        return <DocumentHeaderSection documentType="Receiving" />
      }),
    )

    await userEvent.type(screen.getByLabelText('رقم المستند الورقي'), '٣٤٥')
    await form!.trigger('header.paperDocumentNumber')

    await waitFor(() => expect(screen.getByText(/استخدم أرقاماً إنجليزية فقط/)).toBeInTheDocument())
  })
})
