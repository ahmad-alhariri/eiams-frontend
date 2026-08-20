import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createReceivingSuppliersHandler } from '@/test/msw/receiving-handlers'
import { createWarehouseDocumentCreateHandler } from '@/test/msw/warehouse-document-handlers'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import ReceivingDocumentFormPage from './receiving-document-form-page'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = fixtureUuid(300)
const MATERIAL_ID = fixtureUuid(401)
const ASSET_MATERIAL_ID = fixtureUuid(402)

const warehouse = createWarehouse({ warehouseId: WAREHOUSE_ID })
const material = createMaterial({ materialId: MATERIAL_ID })
const assetMaterial = createMaterial({
  materialId: ASSET_MATERIAL_ID,
  code: 'IT-HW-PRT-101',
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
        <MemoryRouter initialEntries={[ROUTE_PATHS.documentReceivingNew]}>
          <Routes>
            <Route
              path={ROUTE_PATHS.documentReceivingNew}
              element={<ReceivingDocumentFormPage />}
            />
            <Route
              path={ROUTE_PATHS.documentReceivingDetail}
              element={<div data-testid="detail-stub" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

function useLookups() {
  return {
    materialOf: (materialId: string) =>
      materialId === MATERIAL_ID
        ? material
        : materialId === ASSET_MATERIAL_ID
          ? assetMaterial
          : undefined,
    unitOf: () => undefined,
    warehouseOf: (warehouseId: string) => (warehouseId === WAREHOUSE_ID ? warehouse : undefined),
  }
}

async function fillHeaderAndPetal(user: ReturnType<typeof userEvent.setup>) {
  const warehouseCombo = screen.getByRole('combobox', { name: 'المستودع' })
  await user.click(warehouseCombo)
  await user.type(warehouseCombo, 'central')
  await user.click(await screen.findByRole('option', { name: warehouse.nameAr }))

  await user.type(screen.getByLabelText('رقم المستند الورقي'), '2024/101')
  await user.type(screen.getByLabelText('السنة الورقية'), '2024')

  const supplierCombo = screen.getByRole('combobox', { name: 'المورد' })
  await user.click(supplierCombo)
  await user.type(supplierCombo, 'Sha')
  await user.click(await screen.findByRole('option', { name: 'Sham Co' }))
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await fillHeaderAndPetal(user)

  const materialCombo = screen.getByRole('combobox', { name: 'المادة' })
  await user.click(materialCombo)
  await user.type(materialCombo, 'pc')
  await user.click(await screen.findByRole('option', { name: material.nameAr }))
  await user.type(screen.getByLabelText('الكمية'), '10')
}

async function fillAssetLine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'إضافة بند أصل' }))
  const assetCombo = screen.getByRole('combobox', { name: 'المادة (أصل)' })
  await user.click(assetCombo)
  await user.type(assetCombo, 'طب')
  await user.click(await screen.findByRole('option', { name: assetMaterial.nameAr }))
  await user.type(screen.getByLabelText('الرقم التسلسلي (اختياري)'), 'SN-77')
}

function usePageHandlers(store: WarehouseDocument[], nextSystemReference: () => string) {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([warehouse]))),
    http.get(`${API_BASE_URL}/catalog/materials`, () =>
      HttpResponse.json(createPage([material, assetMaterial])),
    ),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      HttpResponse.json([capability]),
    ),
    http.get(`${API_BASE_URL}/catalog/materials/:materialId/unit-conversions`, () =>
      HttpResponse.json([]),
    ),
    ...createReceivingSuppliersHandler(['Sham Co']),
    ...createWarehouseDocumentCreateHandler({
      documentStore: () => store,
      lookups: useLookups(),
      nextSystemReference,
    }),
  )
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('ReceivingDocumentFormPage', () => {
  it('renders the Arabic form sections for a new receiving document', () => {
    render(<ReceivingDocumentFormPage />, { wrapper: createWrapper() })

    expect(screen.getByRole('heading', { name: 'سند استلام جديد' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'بيانات الاستلام' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'بنود الاستلام' })).toBeInTheDocument()
    expect(screen.getByText('بنود الأصول (أصل ثابت لكل وحدة)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument()
  })

  it('shows inline Arabic errors when submitting an empty form', async () => {
    const user = userEvent.setup()
    render(<ReceivingDocumentFormPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('يجب اختيار مستودع صالح من القائمة.')).toBeInTheDocument()
    expect(screen.getByText('رقم المستند الورقي مطلوب.')).toBeInTheDocument()
    expect(screen.getByText('يجب إدخال اسم أو مرجع المورد.')).toBeInTheDocument()
    expect(screen.getAllByText('يجب اختيار مادة صالحة.')).not.toHaveLength(0)
  })

  it('blocks submit when every line row is removed', async () => {
    const user = userEvent.setup()
    render(<ReceivingDocumentFormPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حذف البند 1' }))
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('أضف بنداً واحداً على الأقل.')).toBeInTheDocument()
    expect(screen.getByText('يجب اختيار مستودع صالح من القائمة.')).toBeInTheDocument()
  })

  it('creates a Receiving draft from header + petal + lines and navigates to the detail page', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-RCV-2024-0007')

    const user = userEvent.setup()
    render(<ReceivingDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
    expect(store).toHaveLength(1)
    const created = store[0]!
    expect(created.documentType).toBe('Receiving')
    expect(created.documentStatus).toBe('Draft')
    expect(created.systemReferenceNumber).toBe('EIAMS-RCV-2024-0007')
    expect(created.paperDocumentNumber).toBe('2024/101')
    expect(created.paperDocumentYear).toBe(2024)
    expect(created.warehouse.id).toBe(WAREHOUSE_ID)
    expect(created.receivingInfo).toEqual({
      receivingType: 'Supplier',
      supplierRef: 'Sham Co',
    })
    expect(created.lines).toHaveLength(1)
    expect(created.lines[0]).toMatchObject({
      lineType: 'Normal',
      material: expect.objectContaining({ materialId: MATERIAL_ID }),
      quantity: 10,
    })
  }, 10_000)

  it('saves a mixed document with quantity and asset lines side by side', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-RCV-2024-0008')

    const user = userEvent.setup()
    render(<ReceivingDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)
    await fillAssetLine(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
    expect(store).toHaveLength(1)
    const created = store[0]!
    expect(created.lines).toHaveLength(2)
    expect(created.lines[0]?.lineType).toBe('Normal')
    expect(created.lines[1]).toMatchObject({
      lineType: 'Asset',
      material: expect.objectContaining({ materialId: ASSET_MATERIAL_ID }),
      quantity: 1,
      assetInputs: [{ serialNumber: 'SN-77' }],
    })
  }, 10_000)

  it('saves an asset-only document when every quantity row is removed', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-RCV-2024-0009')

    const user = userEvent.setup()
    render(<ReceivingDocumentFormPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حذف البند 1' }))
    await fillHeaderAndPetal(user)
    await fillAssetLine(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
    expect(store).toHaveLength(1)
    const created = store[0]!
    expect(created.lines).toHaveLength(1)
    expect(created.lines[0]).toMatchObject({
      lineType: 'Asset',
      material: expect.objectContaining({ materialId: ASSET_MATERIAL_ID }),
      quantity: 1,
      assetInputs: [{ serialNumber: 'SN-77' }],
    })
  }, 10_000)

  it('surfaces the Arabic error banner when the create request fails', async () => {
    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents`, () =>
        HttpResponse.json(
          {
            code: 'document.duplicate_paper_number',
            detailAr: null,
            fieldErrors: [],
            status: 409,
            titleAr: 'تعذر حفظ المستند: الوثيقة الورقية مكررة.',
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
      ...createReceivingSuppliersHandler(['Sham Co']),
    )

    const user = userEvent.setup()
    render(<ReceivingDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('تعذر حفظ المستند: الوثيقة الورقية مكررة.')).toBeInTheDocument()
    expect(screen.queryByTestId('detail-stub')).not.toBeInTheDocument()
  })
})
