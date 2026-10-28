import { zodResolver } from '@hookform/resolvers/zod'
import { QueryClientProvider } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { http } from 'msw'
import { type ReactNode } from 'react'
import { FormProvider, useForm, useWatch, type Resolver, type UseFormReturn } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createQueryClient } from '@/shared/services/query.client'
import { errJson, okPageJson } from '@/test/msw/envelope'
import { createWarehouseCapability, fixtureUuid } from '@/test/msw/factories'
import {
  wireMaterial,
  wireMaterialUnitConversion,
  wireUnitOfMeasure,
} from '@/test/msw/catalog-wire-fixtures'
import { server } from '@/test/msw/server'
import { formatArabicDate } from '@/shared/ui/calendar-utils'
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

/**
 * The materials this editor searches are served in the REAL catalog wire shape
 * (`catalog.api-types`): the flat `materialDomainId` / `baseUnitId` /
 * `baseUnitSymbol` pairs, not the frozen generated snapshot's `domain` / `unit`
 * nested references. `wireMaterial` is the shared builder for that contract
 * (see `catalog-wire-fixtures.ts`); the shared `createMaterial` cannot be used
 * here because it is deliberately still typed against the generated snapshot.
 */
const DURABLE = wireMaterial({
  id: fixtureUuid(24),
  nameAr: 'قماش قطني',
  materialKind: 'Durable',
  materialDomainId: fixtureUuid(20),
  baseUnitId: fixtureUuid(23),
  baseUnitSymbol: 'متر',
})
const ASSET = wireMaterial({
  id: fixtureUuid(26),
  materialKind: 'Asset',
  requiresAssetNumber: true,
  trackingType: 'Serial',
  nameAr: 'حاسوب مكتبي',
})
/**
 * A conversion carries a flat `fromUnitId` whose label the editor resolves from
 * the units-of-measure list — there is no nested `unit` reference, and
 * `factor` is the JSON number the contract declares.
 */
const CARTON_CONVERSION = wireMaterialUnitConversion({
  id: fixtureUuid(25),
  materialId: DURABLE.id,
  fromUnitId: fixtureUuid(27),
  toBaseUnitId: fixtureUuid(23),
  factor: 10,
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
    http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([DURABLE, ASSET])),
    http.get(`${API_BASE_URL}/catalog/materials/${DURABLE.id}/unit-conversions`, () =>
      okPageJson([CARTON_CONVERSION]),
    ),
    // The conversion's `fromUnitId` label is resolved from the real
    // units-of-measure list; no `code`, no `nameAr`, no `symbolAr` on it.
    http.get(`${API_BASE_URL}/catalog/units-of-measure`, () =>
      okPageJson([wireUnitOfMeasure({ id: fixtureUuid(27), name: 'لفة', symbol: 'ROLL' })]),
    ),
  )
}

/**
 * Holds the unit-conversions response until the returned function releases it.
 *
 * The conversions read is the SECONDARY read the unit selector depends on, and
 * the states under test (pending, failed, loaded) are all states of THAT read.
 * Releasing the response by hand makes each of them observable instead of
 * racing the fetch.
 */
function holdConversions(response: () => Response) {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${API_BASE_URL}/catalog/materials/${DURABLE.id}/unit-conversions`, async () => {
      await held
      return response()
    }),
  )
  return () => release()
}

/** The Arabic the editor shows for each state of the conversions read. */
const UNIT_CONVERSIONS_LOADING_AR = 'جارٍ تحميل الوحدات البديلة للمادة...'
const UNIT_CONVERSIONS_FAILED_AR =
  'تعذّر جلب الوحدات البديلة لهذه المادة. أعد المحاولة قبل اختيار الوحدة.'

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
    expect(screen.getByText('تاريخ الانتهاء (اختياري)')).toBeInTheDocument()
    // D2: the expiry date uses the shared Arabic RTL picker, not a native
    // `<input type="date">` that renders English month/day/year segments.
    expect(screen.getByRole('button', { name: 'تاريخ انتهاء البند 1' })).toBeInTheDocument()
    expect(document.querySelector('input[type="date"]')).toBeNull()
    expect(screen.queryByText('نوع الافتتاحية')).not.toBeInTheDocument()

    const selected = new Date()
    await user.click(screen.getByRole('button', { name: 'تاريخ انتهاء البند 1' }))
    await user.click(screen.getByRole('button', { name: formatArabicDate(selected) }))
    await waitFor(() =>
      expect(linesValue()[0]?.expiryDate).toBe(dayjs(selected).format('YYYY-MM-DD')),
    )
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
      expect(line?.materialId).toBe(DURABLE.id)
      expect(line?.materialNameAr).toBe('قماش قطني')
      expect(line?.materialDomainId).toBe(fixtureUuid(20))
      expect(line?.baseUnitNameAr).toBe('متر')
    })
    expect(screen.getByText('متر')).toBeInTheDocument()
    // The line states the picked material's kind; only Durable/Asset carry the
    // custody consequence sentence.
    expect(screen.getByText(/^نوع المادة: معمرة — يبقى الأصل ضمن عهدة الجهة/)).toBeInTheDocument()
  })

  /**
   * Regression guard (FIX-R2): the `includeAssetMaterials` flag must stay OFF
   * by default for every type (Receiving/Opening/Issue/Transfer unchanged) and
   * only expose Asset kinds for a caller that opts in — the Return page pairs
   * it with the eligible-asset picker slot.
   */
  it('excludes Asset kinds by default and shows them only when opted in', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    const rendered = render(
      host(() => <QuantityLineEditor documentType="Issue" warehouseId={undefined} />),
    )
    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    fireEvent.change(screen.getByPlaceholderText('ابحث عن مادة...'), { target: { value: 'قطعة' } })
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'قماش قطني' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('option', { name: 'حاسوب مكتبي' })).not.toBeInTheDocument()

    rendered.rerender(
      host(() => (
        <QuantityLineEditor documentType="Return" warehouseId={undefined} includeAssetMaterials />
      )),
    )
    // A DIFFERENT query: the editor is not remounted, so reseeding the same
    // query would keep publishing the stale (Asset-free) result — the material
    // filter swap reaches the option list only through a re-run search.
    fireEvent.change(screen.getByPlaceholderText('ابحث عن مادة...'), { target: { value: 'قط' } })
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'حاسوب مكتبي' })).toBeInTheDocument(),
    )
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

    // The selector stays disabled until the conversions read lands, so the
    // click below must wait for the options to be known.
    await waitFor(() => expect(screen.getByLabelText('وحدة البند 1')).toBeEnabled())
    await user.click(screen.getByLabelText('وحدة البند 1'))
    const rollOption = await screen.findByRole('option', { name: /لفة/ })
    await user.click(rollOption)

    await waitFor(() => {
      const line = linesValue()[0]
      expect(line?.unitId).toBe(fixtureUuid(27))
      expect(line?.conversionId).toBe(CARTON_CONVERSION.id)
      expect(line?.baseQuantity).toBe(50)
    })
    // The trigger itself must show the chosen unit's Arabic label, not the raw
    // conversion id: `getByText` alone would also match the popup option.
    const unitTrigger = screen.getByLabelText('وحدة البند 1')
    expect(unitTrigger).toHaveTextContent('لفة')
    expect(unitTrigger).toHaveTextContent('× 10')
    expect(unitTrigger).not.toHaveTextContent(CARTON_CONVERSION.id)
  })

  it('surfaces a blocked warehouse capability as an Arabic hint per row', async () => {
    const user = userEvent.setup()
    const onCapabilityGateChange = vi.fn()
    const warehouseId = fixtureUuid(30)
    const capability = createWarehouseCapability({
      warehouseId,
      materialDomainId: fixtureUuid(20),
      materialDomainCode: 'DOM-20',
      materialDomainName: 'المستلزمات المنزلية',
      operations: ['Issue'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouseId}/capabilities`, () =>
        okPageJson([capability], { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 }),
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
        'العملية استلام غير مدعومة لهذا المستودع والمجال المطلوبين.',
      ),
    )
    expect(onCapabilityGateChange).toHaveBeenLastCalledWith({
      status: 'blocked',
      messageAr: 'العملية استلام غير مدعومة لهذا المستودع والمجال المطلوبين.',
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

  /**
   * The unit selector's read is a SECONDARY read, and a failed one used to be
   * indistinguishable from an empty one: the selector simply rendered with
   * fewer options, so the keeper could pick a unit that was never verified
   * and save the document with a silently wrong unit. These four tests pin the
   * three states apart — pending, failed, loaded.
   */
  describe('the unit selector reports the state of its conversions read', () => {
    it('disables the selector and shows a loading hint while the read is pending', async () => {
      const user = userEvent.setup()
      useCatalogHandlers()
      holdConversions(() => okPageJson([CARTON_CONVERSION]))
      const { host } = createTestHost()
      render(host(() => <QuantityLineEditor documentType="Receiving" warehouseId={undefined} />))
      await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
      await selectMaterial('قماش قطني')

      await waitFor(() => expect(screen.getByText(UNIT_CONVERSIONS_LOADING_AR)).toBeInTheDocument())
      // A pending read must not offer the base unit as if it were the only one.
      expect(screen.getByLabelText('وحدة البند 1')).toBeDisabled()
      // A pending read is not a failure: no error copy.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('disables the selector and shows an Arabic error when the read fails', async () => {
      const user = userEvent.setup()
      useCatalogHandlers()
      // A scope denial is a permanent answer, so the query does not retry it.
      const release = holdConversions(() =>
        errJson(403, { code: 'FORBIDDEN', message: 'Scope denied.' }),
      )
      const { host } = createTestHost()
      render(host(() => <QuantityLineEditor documentType="Receiving" warehouseId={undefined} />))
      await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
      await selectMaterial('قماش قطني')

      await waitFor(() => expect(screen.getByText(UNIT_CONVERSIONS_LOADING_AR)).toBeInTheDocument())
      release()

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(UNIT_CONVERSIONS_FAILED_AR),
      )
      // No unit may be picked from a list that was never read.
      expect(screen.getByLabelText('وحدة البند 1')).toBeDisabled()
      expect(screen.queryByText(UNIT_CONVERSIONS_LOADING_AR)).not.toBeInTheDocument()
    })

    it('keeps an empty conversions list distinct from a failed one', async () => {
      const user = userEvent.setup()
      useCatalogHandlers()
      const release = holdConversions(() => okPageJson([]))
      const { host } = createTestHost()
      render(host(() => <QuantityLineEditor documentType="Receiving" warehouseId={undefined} />))
      await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
      await selectMaterial('قماش قطني')

      await waitFor(() => expect(screen.getByText(UNIT_CONVERSIONS_LOADING_AR)).toBeInTheDocument())
      release()

      await waitFor(() => expect(screen.getByLabelText('وحدة البند 1')).toBeEnabled())
      // The material simply has no alternative units — that is an answer, not
      // a failure, so it gets no error copy.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText(UNIT_CONVERSIONS_LOADING_AR)).not.toBeInTheDocument()

      await user.click(screen.getByLabelText('وحدة البند 1'))
      expect(await screen.findByRole('option', { name: 'متر' })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /لفة/ })).not.toBeInTheDocument()
    })

    it('shows the conversions and no error when the read succeeds', async () => {
      const user = userEvent.setup()
      useCatalogHandlers()
      const release = holdConversions(() => okPageJson([CARTON_CONVERSION]))
      const { host } = createTestHost()
      render(host(() => <QuantityLineEditor documentType="Receiving" warehouseId={undefined} />))
      await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
      await selectMaterial('قماش قطني')

      await waitFor(() => expect(screen.getByText(UNIT_CONVERSIONS_LOADING_AR)).toBeInTheDocument())
      release()

      await waitFor(() => expect(screen.getByLabelText('وحدة البند 1')).toBeEnabled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText(UNIT_CONVERSIONS_LOADING_AR)).not.toBeInTheDocument()

      await user.click(screen.getByLabelText('وحدة البند 1'))
      expect(await screen.findByRole('option', { name: /لفة/ })).toBeInTheDocument()
    })
  })
})
