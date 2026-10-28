import { zodResolver } from '@hookform/resolvers/zod'
import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { FormProvider, useForm, useWatch, type Resolver, type UseFormReturn } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createQueryClient } from '@/shared/services/query.client'
import { okPageJson } from '@/test/msw/envelope'
import { wireMaterial } from '@/test/msw/catalog-wire-fixtures'
import { createWarehouseCapability, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import {
  assetLinesSchema,
  createEmptyAssetLine,
  type AssetLinesContainer,
} from '../schemas/document-lines.schemas'
import { AssetLineEditor } from './asset-line-editor'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const IT_DOMAIN_ID = fixtureUuid(20)

/**
 * Materials in the REAL catalog wire shape (`catalog.api-types`): the flat
 * `materialDomainId` / `baseUnitId` / `baseUnitSymbol` pairs, and
 * `materialKind` narrowed to `'Consumable' | 'Durable' | 'Asset'`.
 * `wireMaterial` is the shared builder for that contract (see
 * `catalog-wire-fixtures.ts`); the frozen generated `createMaterial` this file
 * used before carries `domain` / `baseUnit` and a `materialId` the wire does not
 * have, so the editor's payload derivation found no domain or unit and no
 * option was ever selected.
 */
const PRINTER = wireMaterial({
  id: fixtureUuid(61),
  code: 'IT-HW-PRT-001',
  nameAr: 'طابعة ليزر',
  materialKind: 'Asset',
  requiresAssetNumber: true,
  trackingType: 'Serial',
  materialDomainId: IT_DOMAIN_ID,
  materialDomainName: 'تقنية المعلومات',
  baseUnitId: fixtureUuid(23),
  baseUnitSymbol: 'قطعة',
})
/** The excluded kind: this editor only offers `materialKind === 'Asset'` rows. */
const DURABLE = wireMaterial({
  id: fixtureUuid(60),
  code: 'IT-HW-PC-001',
  nameAr: 'حاسوب مكتبي',
  materialDomainId: IT_DOMAIN_ID,
  materialDomainName: 'تقنية المعلومات',
  baseUnitId: fixtureUuid(23),
  baseUnitSymbol: 'قطعة',
})

const SEEDED_LINE = {
  materialId: PRINTER.id,
  materialNameAr: PRINTER.nameAr,
  materialDomainId: IT_DOMAIN_ID,
  baseUnitId: fixtureUuid(23),
  baseUnitNameAr: 'قطعة',
  quantity: 1,
  assetInputs: [{}],
}

function LinesOutput({ form }: { form: UseFormReturn<AssetLinesContainer> }) {
  const lines = useWatch({ control: form.control, name: 'lines' })
  return <pre data-slot="asset-lines-values">{JSON.stringify(lines)}</pre>
}

function createTestHost() {
  function Host({
    children,
    initialLines = [],
  }: {
    children: (form: UseFormReturn<AssetLinesContainer>) => ReactNode
    initialLines?: AssetLinesContainer['lines']
  }) {
    const form = useForm<AssetLinesContainer>({
      resolver: zodResolver(z.object({ lines: assetLinesSchema })) as Resolver<AssetLinesContainer>,
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
      children: (form: UseFormReturn<AssetLinesContainer>) => ReactNode,
      initialLines?: AssetLinesContainer['lines'],
    ) => <Host children={children} {...(initialLines === undefined ? {} : { initialLines })} />,
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
  server.resetHandlers()
})

/** Catalog materials search the editor touches while picking a material. */
function useCatalogHandlers() {
  server.use(http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([PRINTER, DURABLE])))
}

async function selectMaterial(name: string, index = 0) {
  const input = screen.getAllByPlaceholderText('ابحث عن مادة أصل...')[index]
  if (input === undefined) {
    throw new Error(`no material input at index ${index}`)
  }
  fireEvent.change(input, { target: { value: name } })
  const option = await screen.findByRole('option', { name: new RegExp('^' + name) })
  fireEvent.click(option)
}

function linesValue(): AssetLinesContainer['lines'] {
  const slot = document.querySelector('[data-slot="asset-lines-values"]')
  return slot === null ? [] : (JSON.parse(slot.textContent ?? '[]') as AssetLinesContainer['lines'])
}

function quantityText(): string {
  const slot = document.querySelector('[data-slot="asset-line-quantity-value"]')
  return slot?.textContent?.trim() ?? ''
}

describe('AssetLineEditor', () => {
  it('shows the empty hint and appends/removes asset-line rows', async () => {
    const user = userEvent.setup()
    const { host } = createTestHost()
    render(host(() => <AssetLineEditor documentType="Receiving" warehouseId={undefined} />))

    expect(
      screen.getByText(
        'لم تُضف بنود أصول بعد. اختر مادة من نوع أصل وسجّل وحدة لكل بند ليُتاح حفظ المسودة.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    expect(screen.getByText('بند الأصول 1')).toBeInTheDocument()
    expect(screen.queryByText(/لم تُضف بنود أصول بعد/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    expect(screen.getByText('بند الأصول 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'حذف البند 2' }))
    expect(screen.queryByText('بند الأصول 2')).not.toBeInTheDocument()
    expect(screen.getByText('بند الأصول 1')).toBeInTheDocument()
  })

  it('searches Asset materials in scope, excludes other kinds, and seeds one unit per selection', async () => {
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <AssetLineEditor documentType="Opening" warehouseId={undefined} />))
    await userEvent.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))

    const input = screen.getByPlaceholderText('ابحث عن مادة أصل...')
    fireEvent.change(input, { target: { value: 'ليزر' } })

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'طابعة ليزر' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('option', { name: 'حاسوب مكتبي' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'طابعة ليزر' }))

    await waitFor(() => {
      const line = linesValue()[0]
      expect(line?.materialId).toBe(PRINTER.id)
      expect(line?.materialNameAr).toBe('طابعة ليزر')
      expect(line?.materialDomainId).toBe(IT_DOMAIN_ID)
      expect(line?.baseUnitNameAr).toBe('قطعة')
      expect(line?.assetInputs).toHaveLength(1)
      expect(line?.quantity).toBe(1)
    })
    expect(screen.getByText('الوحدة 1')).toBeInTheDocument()
    expect(screen.getByLabelText('رقم الأصل (اختياري)')).toBeInTheDocument()
    expect(screen.getByLabelText('الرقم التسلسلي (اختياري)')).toBeInTheDocument()
    expect(screen.getByLabelText('تاريخ الحصول (اختياري)')).toBeInTheDocument()
    expect(screen.getByLabelText('تاريخ انتهاء الضمان (اختياري)')).toBeInTheDocument()
    expect(quantityText()).toBe('1 قطعة')
  })

  it('adding and removing units derives the quantity and captures per-unit values', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <AssetLineEditor documentType="Receiving" warehouseId={undefined} />))
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر')

    await user.click(screen.getByRole('button', { name: 'إضافة وحدة/أصل إلى البند 1' }))
    await waitFor(() => {
      expect(screen.getByText('الوحدة 2')).toBeInTheDocument()
      expect(quantityText()).toBe('2 قطعة')
    })
    await waitFor(() => {
      const line = linesValue()[0]
      expect(line?.assetInputs).toHaveLength(2)
      expect(line?.quantity).toBe(2)
    })

    const firstAssetNumber = screen.getAllByLabelText('رقم الأصل (اختياري)')[0]
    await user.type(firstAssetNumber!, 'A-1001')
    await waitFor(() => expect(linesValue()[0]?.assetInputs[0]?.assetNumber).toBe('A-1001'))

    const firstExpiry = screen.getAllByLabelText('تاريخ انتهاء الضمان (اختياري)')[0]
    fireEvent.change(firstExpiry!, { target: { value: '2027-03-01' } })
    await waitFor(() => expect(linesValue()[0]?.assetInputs[0]?.warrantyExpiry).toBe('2027-03-01'))

    await user.click(screen.getByRole('button', { name: 'حذف الوحدة 2 من البند 1' }))
    await waitFor(() => {
      expect(screen.queryByText('الوحدة 2')).not.toBeInTheDocument()
      expect(quantityText()).toBe('1 قطعة')
      const line = linesValue()[0]
      expect(line?.assetInputs).toHaveLength(1)
      expect(line?.quantity).toBe(1)
      expect(line?.assetInputs[0]?.assetNumber).toBe('A-1001')
    })
  })

  it('captures a pasted serial list as one unit per serial and derives the quantity', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <AssetLineEditor documentType="Receiving" warehouseId={undefined} />))
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر')

    fireEvent.change(screen.getByLabelText('التقاط الأرقام التسلسلية'), {
      target: { value: 'SN-1001\nSN-1002,SN-1003' },
    })
    expect(screen.getByText('تم التقاط ٣ رقماً تسلسلياً، ورُفض ٠')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'تطبيق على الوحدات' }))

    await waitFor(() => {
      expect(linesValue()[0]?.assetInputs).toEqual([
        { serialNumber: 'SN-1001' },
        { serialNumber: 'SN-1002' },
        { serialNumber: 'SN-1003' },
      ])
      expect(linesValue()[0]?.quantity).toBe(3)
    })
    expect(screen.getByText('الوحدة 3')).toBeInTheDocument()
    expect(quantityText()).toBe('3 قطعة')
    expect(screen.getAllByLabelText('الرقم التسلسلي (اختياري)')).toHaveLength(3)
    expect(screen.getByLabelText('التقاط الأرقام التسلسلية')).toHaveValue('')
  })

  it('rejects a serial already captured on the same row instead of appending a second unit', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <AssetLineEditor documentType="Receiving" warehouseId={undefined} />))
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر')

    fireEvent.change(screen.getByLabelText('التقاط الأرقام التسلسلية'), {
      target: { value: 'SN-4001' },
    })
    await user.click(screen.getByRole('button', { name: 'تطبيق على الوحدات' }))
    await waitFor(() => expect(linesValue()[0]?.assetInputs).toEqual([{ serialNumber: 'SN-4001' }]))

    // The same serial again, in different case: the row already carries it.
    fireEvent.change(screen.getByLabelText('التقاط الأرقام التسلسلية'), {
      target: { value: 'sn-4001' },
    })

    expect(screen.getByText('sn-4001: مكرر في هذا البند')).toBeInTheDocument()
    expect(screen.getByText('تم التقاط ٠ رقماً تسلسلياً، ورُفض ١')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تطبيق على الوحدات' })).toBeDisabled()
    expect(screen.getAllByLabelText('الرقم التسلسلي (اختياري)')).toHaveLength(1)
    expect(linesValue()[0]?.assetInputs).toEqual([{ serialNumber: 'SN-4001' }])
    expect(linesValue()[0]?.quantity).toBe(1)
  })

  it('keeps refused serials and their reasons visible after applying the accepted ones', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <AssetLineEditor documentType="Receiving" warehouseId={undefined} />))
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر')

    const tooLong = 'S'.repeat(201)
    fireEvent.change(screen.getByLabelText('التقاط الأرقام التسلسلية'), {
      target: { value: `SN-5001\n${tooLong}` },
    })
    await user.click(screen.getByRole('button', { name: 'تطبيق على الوحدات' }))

    await waitFor(() => expect(linesValue()[0]?.assetInputs).toEqual([{ serialNumber: 'SN-5001' }]))
    // The refused entry keeps its evidence on screen; the summary cannot claim
    // that nothing was refused, and the applied serial is not re-applicable.
    expect(screen.getByText(`${tooLong}: أطول من الحد المسموح (200 حرف)`)).toBeInTheDocument()
    expect(screen.getByText('تم التقاط ٠ رقماً تسلسلياً، ورُفض ١')).toBeInTheDocument()
    expect(screen.getByLabelText('التقاط الأرقام التسلسلية')).toHaveValue(tooLong)
    expect(screen.getByRole('button', { name: 'تطبيق على الوحدات' })).toBeDisabled()
    expect(linesValue()[0]?.assetInputs).toHaveLength(1)
  })

  it('merges captured serials into existing units and rejects serials used by another line', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <AssetLineEditor documentType="Opening" warehouseId={undefined} />))
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر', 0)
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر', 1)

    await user.type(screen.getAllByLabelText('رقم الأصل (اختياري)')[0]!, 'A-1001')
    fireEvent.change(screen.getAllByLabelText('التقاط الأرقام التسلسلية')[0]!, {
      target: { value: 'SN-1001\nSN-1002' },
    })
    await user.click(screen.getAllByRole('button', { name: 'تطبيق على الوحدات' })[0]!)

    await waitFor(() => {
      expect(linesValue()[0]?.assetInputs).toEqual([
        { assetNumber: 'A-1001' },
        { serialNumber: 'SN-1001' },
        { serialNumber: 'SN-1002' },
      ])
      expect(linesValue()[0]?.quantity).toBe(3)
    })

    fireEvent.change(screen.getAllByLabelText('التقاط الأرقام التسلسلية')[1]!, {
      target: { value: 'SN-1002\nSN-2001' },
    })
    expect(screen.getByText('SN-1002: مستخدم في بند آخر')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'تطبيق على الوحدات' })[1]!)
    await waitFor(() => {
      expect(linesValue()[1]?.assetInputs).toEqual([{ serialNumber: 'SN-2001' }])
      expect(linesValue()[1]?.quantity).toBe(1)
    })
  })

  it('surfaces per-unit invalid dates as inline Arabic messages', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    let form: UseFormReturn<AssetLinesContainer> | undefined
    render(
      host((currentForm) => {
        form = currentForm
        return <AssetLineEditor documentType="Receiving" warehouseId={undefined} />
      }),
    )
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر')

    const acquisitionDate = screen.getByLabelText('تاريخ الحصول (اختياري)')
    fireEvent.change(acquisitionDate, { target: { value: '2024-13-01' } })
    await form!.trigger()
    await waitFor(() =>
      expect(screen.getByText('تاريخ حصول غير صالح؛ استخدم صيغة YYYY-MM-DD.')).toBeInTheDocument(),
    )

    const longAssetNumber = screen.getByLabelText('رقم الأصل (اختياري)')
    fireEvent.change(longAssetNumber, { target: { value: 'A'.repeat(101) } })
    await form!.trigger()
    await waitFor(() =>
      expect(screen.getByText('يجب ألا يتجاوز رقم الأصل 100 محرفاً.')).toBeInTheDocument(),
    )
  })

  it('surfaces a blocked warehouse capability as an Arabic hint per row', async () => {
    const user = userEvent.setup()
    const warehouseId = fixtureUuid(30)
    const capability = createWarehouseCapability({
      warehouseId,
      materialDomainId: IT_DOMAIN_ID,
      materialDomainCode: 'IT',
      materialDomainName: 'تقنية المعلومات',
      operations: ['Issue'],
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouseId}/capabilities`, () =>
        okPageJson([capability], { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 }),
      ),
    )
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <AssetLineEditor documentType="Receiving" warehouseId={warehouseId} />))
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'العملية استلام غير مدعومة لهذا المستودع والمجال المطلوبين.',
      ),
    )
  })

  it('reports a blocked aggregate capability gate so parent forms can prevent persistence', async () => {
    const user = userEvent.setup()
    const warehouseId = fixtureUuid(31)
    const capability = createWarehouseCapability({
      warehouseId,
      materialDomainId: IT_DOMAIN_ID,
      materialDomainCode: 'IT',
      materialDomainName: 'تقنية المعلومات',
      operations: ['Issue'],
    })
    const onCapabilityGateChange = vi.fn()
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${warehouseId}/capabilities`, () =>
        okPageJson([capability], { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 }),
      ),
    )
    useCatalogHandlers()
    const { host } = createTestHost()
    render(
      host(() => (
        <AssetLineEditor
          documentType="Opening"
          warehouseId={warehouseId}
          onCapabilityGateChange={onCapabilityGateChange}
        />
      )),
    )

    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر')

    await waitFor(() =>
      expect(onCapabilityGateChange).toHaveBeenLastCalledWith({
        status: 'blocked',
        messageAr: 'العملية استلام غير مدعومة لهذا المستودع والمجال المطلوبين.',
      }),
    )
  })

  it('shows the unknown-capability hint when no warehouse is picked yet', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    render(host(() => <AssetLineEditor documentType="Receiving" warehouseId={undefined} />))
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر')

    await waitFor(() =>
      expect(
        screen.getByText('التحقق من قدرة المستودع يتطلب اختيار المستودع ضمن قسم رأس السند.'),
      ).toBeInTheDocument(),
    )
  })

  it('validates untouched rows and duplicate materials in Arabic', async () => {
    const user = userEvent.setup()
    useCatalogHandlers()
    const { host } = createTestHost()
    let form: UseFormReturn<AssetLinesContainer> | undefined
    render(
      host((currentForm) => {
        form = currentForm
        return <AssetLineEditor documentType="Receiving" warehouseId={undefined} />
      }),
    )

    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await form!.trigger()

    await waitFor(() => expect(screen.getByText('يجب اختيار مادة صالحة.')).toBeInTheDocument())

    await selectMaterial('طابعة ليزر')
    await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
    await selectMaterial('طابعة ليزر', 1)
    await form!.trigger()

    await waitFor(() =>
      expect(screen.getByText('لا يجوز تكرار المادة نفسها في أكثر من بند.')).toBeInTheDocument(),
    )
  })

  it('disables every row, unit, and action in disabled mode', () => {
    useCatalogHandlers()
    const { host } = createTestHost()
    render(
      host(
        () => <AssetLineEditor documentType="Receiving" warehouseId={undefined} disabled />,
        [SEEDED_LINE, createEmptyAssetLine()],
      ),
    )

    expect(screen.getByRole('button', { name: 'إضافة بند أصل' })).toBeDisabled()
    expect(screen.getAllByPlaceholderText('ابحث عن مادة أصل...')[0]).toBeDisabled()
    expect(screen.getAllByLabelText('رقم الأصل (اختياري)')[0]).toBeDisabled()
    expect(screen.getAllByLabelText('الرقم التسلسلي (اختياري)')[0]).toBeDisabled()
    expect(screen.getAllByLabelText('تاريخ الحصول (اختياري)')[0]).toBeDisabled()
    expect(screen.getAllByLabelText('تاريخ انتهاء الضمان (اختياري)')[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: 'حذف الوحدة 1 من البند 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'إضافة وحدة/أصل إلى البند 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'حذف البند 1' })).toBeDisabled()
  })
})
