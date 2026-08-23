import { zodResolver } from '@hookform/resolvers/zod'
import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { type ReactNode } from 'react'
import { FormProvider, useForm, useWatch, type Resolver, type UseFormReturn } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createQueryClient } from '@/shared/services/query.client'
import {
  createMaterial,
  createMaterialUnitConversion,
  createPage,
  createWarehouseCapability,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import {
  documentLinesSchema,
  createEmptyQuantityLine,
  type DocumentLinesContainer,
} from '../schemas/document-lines.schemas'
import { QuantityLineEditor } from './quantity-line-editor'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

const DURABLE = createMaterial({
  materialId: fixtureUuid(24),
  nameAr: 'قماش قطني',
  domain: {
    id: fixtureUuid(20),
    displayName: 'المستلزمات المنزلية',
    code: 'DOM-20',
    status: 'Active',
  },
  baseUnit: { id: fixtureUuid(23), displayName: 'متر', code: 'MTR', status: 'Active' },
})
const ASSET = createMaterial({
  materialId: fixtureUuid(26),
  materialKind: 'Asset',
  requiresAssetNumber: true,
  nameAr: 'حاسوب مكتبي',
})
const CARTON_CONVERSION = createMaterialUnitConversion({
  conversionId: fixtureUuid(25),
  factor: '10',
  fromUnit: { id: fixtureUuid(27), displayName: 'لفة', code: 'RL', status: 'Active' },
})

function LinesOutput({ form }: { form: UseFormReturn<DocumentLinesContainer> }) {
  const lines = useWatch({ control: form.control, name: 'lines' })
  return <pre data-slot="document-lines-values">{JSON.stringify(lines)}</pre>
}

function createTestHost() {
  function Host({
    children,
    initialLines = [],
  }: {
    children: (form: UseFormReturn<DocumentLinesContainer>) => ReactNode
    initialLines?: DocumentLinesContainer['lines']
  }) {
    const form = useForm<DocumentLinesContainer>({
      resolver: zodResolver(
        z.object({ lines: documentLinesSchema }),
      ) as Resolver<DocumentLinesContainer>,
      defaultValues: { lines: initialLines },
      mode: 'onSubmit',
    })
    return (
      <QueryClientProvider client={createQueryClient()}>
        <FormProvider {...form}>
          <form aria-label="test-form" onSubmit={(event) => event.preventDefault()}>
            {children(form)}
            <LinesOutput form={form} />
          </form>
        </FormProvider>
      </QueryClientProvider>
    )
  }
  return {
    host: (
      children: (form: UseFormReturn<DocumentLinesContainer>) => ReactNode,
      initialLines?: DocumentLinesContainer['lines'],
    ) => <Host children={children} {...(initialLines === undefined ? {} : { initialLines })} />,
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  server.resetHandlers()
})

async function selectMaterial(name: string, index = 0) {
  const input = screen.getAllByPlaceholderText('ابحث عن مادة...')[index]
  if (input === undefined) {
    throw new Error(`no material input at index ${index}`)
  }
  fireEvent.change(input, { target: { value: name } })
  const option = await screen.findByRole('option', { name: new RegExp('^' + name) })
  fireEvent.click(option)
}

/** Catalog endpoints the editor touches while a material is selected. */
function useCatalogHandlers() {
  server.use(
    http.get(`${API_BASE_URL}/catalog/materials`, () =>
      HttpResponse.json(createPage([DURABLE, ASSET])),
    ),
    http.get(`${API_BASE_URL}/catalog/materials/${DURABLE.materialId}/unit-conversions`, () =>
      HttpResponse.json([CARTON_CONVERSION]),
    ),
  )
}

function linesValue(): DocumentLinesContainer['lines'] {
  const slot = document.querySelector('[data-slot="document-lines-values"]')
  return slot === null
    ? []
    : (JSON.parse(slot.textContent ?? '[]') as DocumentLinesContainer['lines'])
}

describe('QuantityLineEditor', () => {
  it('shows the empty hint, appends rows and removes them again', async () => {
    const user = userEvent.setup()
    const { host } = createTestHost()
    render(host(() => <QuantityLineEditor documentType="Receiving" warehouseId={undefined} />))

    expect(
      screen.getByText('لم تُضف بنود بعد. أضف مادة وكمية لكل بند ليُتاح حفظ المسودة.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    expect(screen.getByText('البند 1')).toBeInTheDocument()
    expect(
      screen.queryByText('لم تُضف بنود بعد. أضف مادة وكمية لكل بند ليُتاح حفظ المسودة.'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    expect(screen.getByText('البند 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'حذف البند 2' }))
    expect(screen.queryByText('البند 2')).not.toBeInTheDocument()
    expect(screen.getByText('البند 1')).toBeInTheDocument()
  })

  it('renders the per-type optional fields from the feature preset', async () => {
    const user = userEvent.setup()
    const { host } = createTestHost()
    render(host(() => <QuantityLineEditor documentType="Receiving" warehouseId={undefined} />))
    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))

    expect(screen.getByLabelText('المادة')).toBeInTheDocument()
    expect(screen.getByLabelText('الكمية')).toBeInTheDocument()
    expect(screen.getByText('وحدة القياس')).toBeInTheDocument()
    expect(screen.getByLabelText('سعر الوحدة (اختياري)')).toBeInTheDocument()
    expect(screen.getByLabelText('رقم الدفعة (اختياري)')).toBeInTheDocument()
    expect(screen.getByLabelText('تاريخ الانتهاء (اختياري)')).toBeInTheDocument()
    expect(screen.queryByText('نوع الافتتاحية')).not.toBeInTheDocument()
  })

  it('renders the opening-type selector for Opening documents only', async () => {
    const user = userEvent.setup()
    const { host } = createTestHost()
    const { rerender } = render(
      host(() => <QuantityLineEditor documentType="Opening" warehouseId={undefined} />),
    )
    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))

    expect(screen.getByText('نوع الافتتاحية')).toBeInTheDocument()
    expect(screen.queryByLabelText('سعر الوحدة (اختياري)')).not.toBeInTheDocument()

    const trigger = screen.getByLabelText('نوع الافتتاحية للبند 1')
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'افتتاحية أولية' }))

    await waitFor(() => expect(linesValue()[0]?.openingType).toBe('Initial'))

    rerender(host(() => <QuantityLineEditor documentType="Issue" warehouseId={undefined} />))
    expect(screen.queryByText('نوع الافتتاحية')).not.toBeInTheDocument()
  })

  it('searches materials server-side, excludes Asset kinds and captures display snapshots', async () => {
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <QuantityLineEditor documentType="Receiving" warehouseId={undefined} />))
    await userEvent.click(screen.getByRole('button', { name: 'إضافة بند' }))

    const input = screen.getByPlaceholderText('ابحث عن مادة...')
    fireEvent.change(input, { target: { value: 'قطعة' } })

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'قماش قطني' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('option', { name: 'حاسوب مكتبي' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'قماش قطني' }))

    await waitFor(() => {
      const line = linesValue()[0]
      expect(line?.materialId).toBe(DURABLE.materialId)
      expect(line?.materialNameAr).toBe('قماش قطني')
      expect(line?.materialDomainId).toBe(fixtureUuid(20))
      expect(line?.baseUnitNameAr).toBe('متر')
    })
    expect(screen.getByText('متر')).toBeInTheDocument()
  })

  it('derives the base-quantity preview and unit ids when an alternative unit is picked', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <QuantityLineEditor documentType="Receiving" warehouseId={undefined} />))
    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    await selectMaterial('قماش قطني')

    const quantityInput = screen.getByLabelText('الكمية')
    await user.clear(quantityInput)
    await user.type(quantityInput, '5')

    await user.click(screen.getByLabelText('وحدة البند 1'))
    const rollOption = await screen.findByRole('option', { name: /لفة/ })
    await user.click(rollOption)

    await waitFor(() => {
      const line = linesValue()[0]
      expect(line?.unitId).toBe(fixtureUuid(27))
      expect(line?.conversionId).toBe(CARTON_CONVERSION.conversionId)
      expect(line?.baseQuantity).toBe(50)
    })
    expect(screen.getByText('لفة')).toBeInTheDocument()
  })

  it('surfaces a blocked warehouse capability as an Arabic hint per row', async () => {
    const user = userEvent.setup()
    const onCapabilityGateChange = vi.fn()
    const warehouseId = fixtureUuid(30)
    const capability = createWarehouseCapability({
      warehouseId,
      domain: {
        id: fixtureUuid(20),
        displayName: 'المستلزمات المنزلية',
        code: 'DOM-20',
        status: 'Active',
      },
      operations: ['Issue'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouseId}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
    )
    useCatalogHandlers()
    const { host } = createTestHost()
    render(
      host(() => (
        <QuantityLineEditor
          documentType="Receiving"
          warehouseId={warehouseId}
          onCapabilityGateChange={onCapabilityGateChange}
        />
      )),
    )
    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    await selectMaterial('قماش قطني')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'المستودع لا يمتلك قدرة "استلام" لمجال "المستلزمات المنزلية".',
      ),
    )
    expect(onCapabilityGateChange).toHaveBeenLastCalledWith({
      status: 'blocked',
      messageAr: 'المستودع لا يمتلك قدرة "استلام" لمجال "المستلزمات المنزلية".',
    })
  })

  it('shows the unknown-capability hint when no warehouse is picked yet', async () => {
    const user = userEvent.setup()
    const onCapabilityGateChange = vi.fn()
    useCatalogHandlers()
    const { host } = createTestHost()
    render(
      host(() => (
        <QuantityLineEditor
          documentType="Receiving"
          warehouseId={undefined}
          onCapabilityGateChange={onCapabilityGateChange}
        />
      )),
    )
    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    await selectMaterial('قماش قطني')

    await waitFor(() =>
      expect(
        screen.getByText('التحقق من قدرة المستودع يتطلب اختيار المستودع ضمن قسم رأس السند.'),
      ).toBeInTheDocument(),
    )
    expect(onCapabilityGateChange).toHaveBeenLastCalledWith({
      status: 'unverified',
      messageAr: 'يتعذر حفظ المسودة قبل التحقق من قدرة المستودع لكل مادة مختارة.',
    })
  })

  it('validates untouched rows and duplicate materials in Arabic', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    let form: UseFormReturn<DocumentLinesContainer> | undefined
    render(
      host((currentForm) => {
        form = currentForm
        return <QuantityLineEditor documentType="Receiving" warehouseId={undefined} />
      }),
    )

    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    await form!.trigger()

    await waitFor(() => expect(screen.getByText('يجب اختيار مادة صالحة.')).toBeInTheDocument())
    expect(screen.getByText('يجب أن تكون الكمية أكبر من صفر.')).toBeInTheDocument()

    await selectMaterial('قماش قطني')
    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    await selectMaterial('قماش قطني', 1)
    await form!.trigger()

    await waitFor(() =>
      expect(screen.getByText('لا يجوز تكرار المادة نفسها في أكثر من بند.')).toBeInTheDocument(),
    )
  })

  it('disables every row and action in disabled mode', () => {
    const { host } = createTestHost()
    render(
      host(
        () => <QuantityLineEditor documentType="Receiving" warehouseId={undefined} disabled />,
        [createEmptyQuantityLine()],
      ),
    )

    expect(screen.getByRole('button', { name: 'إضافة بند' })).toBeDisabled()
    expect(screen.getByLabelText('الكمية')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'حذف البند 1' })).toBeDisabled()
    expect(screen.getByPlaceholderText('ابحث عن مادة...')).toBeDisabled()
  })
})
