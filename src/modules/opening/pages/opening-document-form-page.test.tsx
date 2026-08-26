import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROUTE_PATHS } from '@/config/routes'
import type { WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import {
  createMaterial,
  createPage,
  createWarehouse,
  createWarehouseCapability,
  createWarehouseDocument,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createWarehouseDocumentCreateHandler } from '@/test/msw/warehouse-document-handlers'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import OpeningDocumentFormPage from './opening-document-form-page'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = fixtureUuid(500)
const MATERIAL_ID = fixtureUuid(501)
const ASSET_MATERIAL_ID = fixtureUuid(502)

const warehouse = createWarehouse({ warehouseId: WAREHOUSE_ID })
const material = createMaterial({ materialId: MATERIAL_ID })
const assetMaterial = createMaterial({
  materialId: ASSET_MATERIAL_ID,
  code: 'IT-HW-PRT-201',
  nameAr: 'طابعة ليزر',
  materialKind: 'Asset',
  requiresAssetNumber: true,
  trackingType: 'Serial',
  domain: material.domain,
  category: material.category,
  family: material.family,
  baseUnit: { id: fixtureUuid(23), displayName: 'قطعة', code: 'EA', status: 'Active' },
})
const capability = createWarehouseCapability({
  warehouseId: WAREHOUSE_ID,
  domain: material.domain,
  operations: ['Receiving', 'Issue'],
})

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function QueryWrapper() {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[ROUTE_PATHS.documentOpeningNew]}>
          <Routes>
            <Route path={ROUTE_PATHS.documentOpeningNew} element={<OpeningDocumentFormPage />} />
            <Route
              path={ROUTE_PATHS.documentOpeningDetail}
              element={<div data-testid="detail-stub" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

function usePageHandlers(
  store: WarehouseDocument[],
  nextSystemReference: () => string,
  capabilityResponse = [capability],
) {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([warehouse]))),
    http.get(`${API_BASE_URL}/catalog/materials`, () =>
      HttpResponse.json(createPage([material, assetMaterial])),
    ),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      HttpResponse.json(capabilityResponse),
    ),
    http.get(`${API_BASE_URL}/catalog/materials/:materialId/unit-conversions`, () =>
      HttpResponse.json([]),
    ),
    ...createWarehouseDocumentCreateHandler({
      documentStore: () => store,
      lookups: {
        materialOf: (materialId) =>
          materialId === MATERIAL_ID
            ? material
            : materialId === ASSET_MATERIAL_ID
              ? assetMaterial
              : undefined,
        unitOf: () => undefined,
        warehouseOf: (warehouseId) => (warehouseId === WAREHOUSE_ID ? warehouse : undefined),
      },
      nextSystemReference,
    }),
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await fillHeader(user)

  const materialCombo = screen.getByRole('combobox', { name: 'المادة' })
  await user.click(materialCombo)
  await user.type(materialCombo, 'pc')
  await user.click(await screen.findByRole('option', { name: material.nameAr }))
  await user.type(screen.getByLabelText('الكمية'), '10')

  await user.click(screen.getByLabelText('نوع الافتتاحية للبند 1'))
  await user.click(await screen.findByRole('option', { name: 'افتتاحية أولية' }))
}

async function fillHeader(user: ReturnType<typeof userEvent.setup>) {
  const warehouseCombo = screen.getByRole('combobox', { name: 'المستودع' })
  await user.click(warehouseCombo)
  await user.type(warehouseCombo, 'central')
  await user.click(await screen.findByRole('option', { name: warehouse.nameAr }))

  await user.type(screen.getByLabelText('رقم المستند الورقي'), '2024/151')
  await user.type(screen.getByLabelText('السنة الورقية'), '2024')
}

async function fillAssetLine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
  const assetCombo = screen.getByRole('combobox', { name: 'المادة (أصل)' })
  await user.click(assetCombo)
  await user.type(assetCombo, 'طاب')
  await user.click(await screen.findByRole('option', { name: assetMaterial.nameAr }))

  await user.type(screen.getByLabelText('رقم الأصل (اختياري)'), 'AST-2024-001')
  await user.type(screen.getByLabelText('الرقم التسلسلي (اختياري)'), 'SN-77')
  await user.type(screen.getByLabelText('تاريخ الحصول (اختياري)'), '2024-01-15')
}

function openingForm(): HTMLFormElement {
  const form = document.querySelector<HTMLFormElement>('form[data-slot="opening-document-form"]')
  if (form === null) {
    throw new Error('Opening draft form is not rendered.')
  }
  return form
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('OpeningDocumentFormPage', () => {
  it('renders the Arabic Opening draft surface with the shared opening-type line control', () => {
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    expect(screen.getByRole('heading', { name: 'سند فتح افتتاحي جديد' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'سياسة الرصيد الافتتاحي' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'الرصيد الافتتاحي إجراء تهيئة لمرة واحدة وليس مستنداً دورياً. يعرض النظام نتيجة التحقق المعتمدة عند حفظ المسودة أو متابعة دورة المستند.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'بنود الرصيد الافتتاحي' })).toBeInTheDocument()
    expect(screen.getByLabelText('نوع الافتتاحية للبند 1')).toBeInTheDocument()
    expect(screen.getByText('بنود الأصول (أصل ثابت لكل وحدة)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إضافة بند أصل' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeInTheDocument()
  })

  it('shows the shared Arabic draft validation errors for an empty form', async () => {
    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('يجب اختيار مستودع صالح من القائمة.')).toBeInTheDocument()
    expect(screen.getByText('رقم المستند الورقي مطلوب.')).toBeInTheDocument()
    expect(screen.getAllByText('يجب اختيار مادة صالحة.')).not.toHaveLength(0)
  })

  it('posts the Opening spine and selected opening type as a draft, then navigates to detail', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0001')

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
    expect(store).toHaveLength(1)
    expect(store[0]).toMatchObject({
      documentType: 'Opening',
      documentStatus: 'Draft',
      paperDocumentNumber: '2024/151',
      paperDocumentYear: 2024,
      systemReferenceNumber: 'EIAMS-OPN-2024-0001',
      warehouse: { id: WAREHOUSE_ID },
      lines: [
        expect.objectContaining({
          material: expect.objectContaining({ materialId: MATERIAL_ID }),
          openingType: 'Initial',
          quantity: 10,
        }),
      ],
    })
  }, 10_000)

  it('saves an asset-only Opening draft with one AssetInput per unit', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0005')

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حذف البند 1' }))
    await fillHeader(user)
    await fillAssetLine(user)
    await user.click(screen.getByRole('button', { name: 'إضافة وحدة/أصل إلى البند 1' }))
    await user.type(screen.getAllByLabelText('الرقم التسلسلي (اختياري)')[1]!, 'SN-78')
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
    expect(store).toHaveLength(1)
    expect(store[0]?.lines).toHaveLength(1)
    expect(store[0]?.lines[0]).toMatchObject({
      lineType: 'Asset',
      material: expect.objectContaining({ materialId: ASSET_MATERIAL_ID }),
      quantity: 2,
      assetInputs: [
        {
          assetNumber: 'AST-2024-001',
          serialNumber: 'SN-77',
          acquisitionDate: '2024-01-15',
        },
        { serialNumber: 'SN-78' },
      ],
    })
  }, 10_000)

  it('saves mixed quantity and asset Opening lines in the one contract draft payload', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0006')

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)
    await fillAssetLine(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
    expect(store[0]?.lines).toHaveLength(2)
    expect(store[0]?.lines[0]).toMatchObject({
      material: expect.objectContaining({ materialId: MATERIAL_ID }),
      openingType: 'Initial',
      quantity: 10,
    })
    expect(store[0]?.lines[1]).toMatchObject({
      lineType: 'Asset',
      material: expect.objectContaining({ materialId: ASSET_MATERIAL_ID }),
      quantity: 1,
      assetInputs: [
        {
          assetNumber: 'AST-2024-001',
          serialNumber: 'SN-77',
          acquisitionDate: '2024-01-15',
        },
      ],
    })
  }, 10_000)

  it('blocks a POST when the selected material domain lacks the Opening capability', async () => {
    const store: WarehouseDocument[] = []
    const unsupportedCapability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      domain: material.domain,
      operations: ['Issue'],
    })
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0003', [unsupportedCapability])

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)

    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled())
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain(
      `المستودع لا يمتلك قدرة "استلام" لمجال "${material.domain.displayName}".`,
    )

    fireEvent.submit(openingForm())
    await waitFor(() => expect(store).toHaveLength(0))
    expect(screen.queryByTestId('detail-stub')).not.toBeInTheDocument()
  }, 10_000)

  it('blocks an asset-only Opening draft when its domain lacks Receiving capability', async () => {
    const store: WarehouseDocument[] = []
    const unsupportedCapability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      domain: assetMaterial.domain,
      operations: ['Issue'],
    })
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0007', [unsupportedCapability])

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حذف البند 1' }))
    await fillHeader(user)
    await fillAssetLine(user)

    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled())
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain(
      `المستودع لا يمتلك قدرة "استلام" لمجال "${assetMaterial.domain.displayName}".`,
    )

    fireEvent.submit(openingForm())
    await waitFor(() => expect(store).toHaveLength(0))
  }, 10_000)

  it('waits for capability verification before posting an otherwise valid Opening draft', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0004')
    let releaseCapabilityRequest: (() => void) | undefined
    const pendingCapabilityResponse = new Promise<void>((resolve) => {
      releaseCapabilityRequest = resolve
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, async () => {
        await pendingCapabilityResponse
        return HttpResponse.json([capability])
      }),
    )

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)

    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled())
    expect(screen.getByRole('status')).toHaveTextContent(
      'يتعذر حفظ المسودة قبل التحقق من قدرة المستودع لكل مادة مختارة.',
    )

    fireEvent.submit(openingForm())
    expect(store).toHaveLength(0)

    releaseCapabilityRequest?.()
    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
    expect(store).toHaveLength(1)
  }, 10_000)

  it('waits for asset capability verification before posting an asset-only Opening draft', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0008')
    let releaseCapabilityRequest: (() => void) | undefined
    const pendingCapabilityResponse = new Promise<void>((resolve) => {
      releaseCapabilityRequest = resolve
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, async () => {
        await pendingCapabilityResponse
        return HttpResponse.json([capability])
      }),
    )

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حذف البند 1' }))
    await fillHeader(user)
    await fillAssetLine(user)

    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled())
    expect(screen.getByRole('status')).toHaveTextContent(
      'يتعذر حفظ المسودة قبل التحقق من قدرة المستودع لكل مادة مختارة.',
    )

    fireEvent.submit(openingForm())
    expect(store).toHaveLength(0)

    releaseCapabilityRequest?.()
    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
    expect(store).toHaveLength(1)
  }, 10_000)

  it('shows a server-authoritative one-time policy rejection and remains on the draft page', async () => {
    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents`, () =>
        HttpResponse.json(
          {
            code: 'validation.failed',
            detailAr: null,
            fieldErrors: [],
            status: 409,
            titleAr: 'تعذر حفظ المستند: سبق تهيئة الرصيد الافتتاحي لهذا المستودع.',
            traceId: 'mock-trace',
          },
          { status: 409 },
        ),
      ),
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([warehouse]))),
      http.get(`${API_BASE_URL}/catalog/materials`, () =>
        HttpResponse.json(createPage([material])),
      ),
      http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
      http.get(`${API_BASE_URL}/catalog/materials/:materialId/unit-conversions`, () =>
        HttpResponse.json([]),
      ),
    )

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(
      await screen.findByText('تعذر حفظ المستند: سبق تهيئة الرصيد الافتتاحي لهذا المستودع.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'الرصيد الافتتاحي إجراء تهيئة لمرة واحدة وليس مستنداً دورياً. يعرض النظام نتيجة التحقق المعتمدة عند حفظ المسودة أو متابعة دورة المستند.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('detail-stub')).not.toBeInTheDocument()
  }, 10_000)

  it('disables repeated submission while an Opening draft is being saved', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0002')
    let requestCount = 0
    let releaseRequest: (() => void) | undefined
    const pendingResponse = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents`, async () => {
        requestCount += 1
        await pendingResponse
        return HttpResponse.json(
          createWarehouseDocument({
            documentId: fixtureUuid(502),
            documentStatus: 'Draft',
            documentType: 'Opening',
          }),
          { status: 201 },
        )
      }),
    )

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)
    const submit = screen.getByRole('button', { name: 'حفظ المسودة' })
    await user.click(submit)

    await waitFor(() => expect(requestCount).toBe(1))
    expect(screen.getByRole('button', { name: 'جارٍ الحفظ...' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'جارٍ الحفظ...' }))
    expect(requestCount).toBe(1)

    releaseRequest?.()
    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
  }, 10_000)
})
