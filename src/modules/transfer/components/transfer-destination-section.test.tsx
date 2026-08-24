import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { FormProvider, useForm } from 'react-hook-form'

import { TransferDestinationSection } from './transfer-destination-section'
import type { TransferPetalContainer } from '@/modules/transfer/schemas/transfer-info.schema'
import { createPage, createWarehouse } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } as unknown }),
}))

const SOURCE_WAREHOUSE_ID = '33333333-3333-4333-8333-333333333301'
const DESTINATION_WAREHOUSE_ID = '44444444-4444-4444-8444-444444444402'

function useHandlers() {
  const sourceWarehouse = createWarehouse({
    warehouseId: SOURCE_WAREHOUSE_ID,
    nameAr: 'المستودع المركزي',
  })
  const destinationWarehouse = createWarehouse({
    warehouseId: DESTINATION_WAREHOUSE_ID,
    nameAr: 'مستودع الفرع الشمالي',
  })
  server.use(
    http.get('/api/v1/warehouses', () =>
      HttpResponse.json(createPage([sourceWarehouse, destinationWarehouse])),
    ),
  )
}

function TestHarness({
  disabled = false,
  onPetal,
}: {
  disabled?: boolean
  onPetal?: (values: TransferPetalContainer) => void
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const form = useForm<TransferPetalContainer>({
    defaultValues: {
      petal: {
        transferInfo: { destinationWarehouseId: '', transferReason: '' },
        destinationWarehouseName: '',
      },
      header: { warehouseId: SOURCE_WAREHOUSE_ID },
      lines: [],
    } as unknown as TransferPetalContainer,
  })
  // Expose live petal state so tests can assert the selection-time capture.
  if (onPetal !== undefined) {
    form.watch(() => onPetal(form.getValues()))
  }
  return (
    <QueryClientProvider client={client}>
      <FormProvider {...form}>
        <form>
          <TransferDestinationSection sourceWarehouseId={SOURCE_WAREHOUSE_ID} disabled={disabled} />
        </form>
      </FormProvider>
    </QueryClientProvider>
  )
}

async function searchDestination(user: ReturnType<typeof userEvent.setup>) {
  const combo = screen.getByLabelText('مستودع الوجهة')
  await user.click(combo)
  await user.type(combo, 'شمالي')
  const options = await screen.findAllByRole('option')
  const target = options.find((option) =>
    (option.textContent ?? '').includes('مستودع الفرع الشمالي'),
  )
  expect(target).toBeDefined()
  if (target) {
    await user.click(target)
  }
}

describe('TransferDestinationSection (e17-t03)', () => {
  it('renders the destination picker and reason field with Arabic labels', () => {
    useHandlers()
    render(<TestHarness />)

    expect(screen.getByText('جهة التحويل')).toBeInTheDocument()
    expect(screen.getByLabelText('مستودع الوجهة')).toBeInTheDocument()
    expect(screen.getByLabelText('سبب التحويل')).toBeInTheDocument()
  })

  it('captures the id and selection-time warehouse name on pick', async () => {
    useHandlers()
    let petalState: TransferPetalContainer | undefined
    const user = userEvent.setup()
    render(
      <TestHarness
        onPetal={(values) => {
          petalState = values
        }}
      />,
    )

    await searchDestination(user)

    await vi.waitFor(() => {
      expect(petalState?.petal.transferInfo.destinationWarehouseId).toBe(DESTINATION_WAREHOUSE_ID)
      expect(petalState?.petal.destinationWarehouseName).toBe('مستودع الفرع الشمالي')
    })
  })

  it('excludes the source warehouse from the destination options', async () => {
    useHandlers()
    const user = userEvent.setup()
    render(<TestHarness />)

    const combo = screen.getByLabelText('مستودع الوجهة')
    await user.click(combo)
    await user.type(combo, 'مستودع')

    // Give the debounced loader time to resolve both warehouses.
    const options = await screen.findAllByRole('option')
    const labels = options.map((option) => option.textContent ?? '')
    expect(labels.some((label) => label.includes('المستودع المركزي'))).toBe(false)
    expect(labels.some((label) => label.includes('مستودع الفرع الشمالي'))).toBe(true)
  })
})
