import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROUTE_PATHS } from '@/config/routes'
import type { WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import {
  createMaterial,
  createWarehouse,
  createWarehouseCapability,
  fixtureUuid,
} from '@/test/msw/factories'
import { wireMaterial } from '@/test/msw/catalog-wire-fixtures'
import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { createReceivingSuppliersHandler } from '@/test/msw/receiving-handlers'
import { createCompleteDraftHandler } from '@/test/msw/warehouse-document-handlers'

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
const SUPPLIER_PARTY_ID = fixtureUuid(600)
const ASSET_MATERIAL_ID = fixtureUuid(402)
const MATERIAL_DOMAIN_ID = fixtureUuid(20)
const MATERIAL_BASE_UNIT_ID = fixtureUuid(23)

const warehouse = createWarehouse({ id: WAREHOUSE_ID })
/**
 * Materials in the REAL catalog wire shape — `wireMaterial` mints
 * `catalog.api-types.Material`, which is what `GET /catalog/materials` serves
 * and what the line editor's payload derivation reads: the flat
 * `materialDomainId` / `baseUnitId` / `baseUnitSymbol` pairs and the
 * identifier `id`.
 *
 * The retired local projection off the shared `createMaterial()` minted
 * `materialId` plus nested `domain` / `category` / `family` / `unit` / `rowVersion`
 * fields, so the picker's option value never matched the id the response
 * carried and no material could be selected.
 */
const material = wireMaterial({
  id: MATERIAL_ID,
  nameAr: 'حاسوب مكتبي',
  materialDomainId: MATERIAL_DOMAIN_ID,
  baseUnitId: MATERIAL_BASE_UNIT_ID,
  baseUnitSymbol: 'قطعة',
})
const assetMaterial = wireMaterial({
  id: ASSET_MATERIAL_ID,
  code: 'IT-HW-PRT-101',
  nameAr: 'طابعة ليزر',
  materialKind: 'Asset',
  requiresAssetNumber: true,
  trackingType: 'Serial',
  materialDomainId: MATERIAL_DOMAIN_ID,
  baseUnitId: MATERIAL_BASE_UNIT_ID,
  baseUnitSymbol: 'قطعة',
})
const capability = createWarehouseCapability({
  warehouseId: WAREHOUSE_ID,
  // The capability's domain reference must name the material's own
  // `materialDomainId` — the flat pair the line editor reads off the payload.
  materialDomainId: MATERIAL_DOMAIN_ID,
  materialDomainName: 'تقنية المعلومات',
  materialDomainCode: 'TEST',
  operations: ['Receiving', 'Issue'],
})

/**
 * The shared document-create handler embeds a material snapshot in its created
 * document, so its `materialOf` lookup answers with the catalog DTO that the
 * projection carries across the boundary.
 */
function generatedMaterialOf(materialId: string) {
  if (materialId === ASSET_MATERIAL_ID) {
    return createMaterial({
      id: materialId,
      code: 'IT-HW-PRT-101',
      nameAr: 'طابعة ليزر',
      materialKind: 'Asset',
      requiresAssetNumber: true,
      trackingType: 'Serial',
    })
  }
  return materialId === MATERIAL_ID ? createMaterial({ id: materialId }) : undefined
}

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
    materialOf: generatedMaterialOf,
    unitOf: () => undefined,
    warehouseOf: (warehouseId: string) => (warehouseId === WAREHOUSE_ID ? warehouse : undefined),
  }
}

async function fillHeaderAndPetal(user: ReturnType<typeof userEvent.setup>) {
  const warehouseCombo = screen.getByRole('combobox', { name: 'المستودع' })
  await user.click(warehouseCombo)
  await user.type(warehouseCombo, 'central')
  await user.click(await screen.findByRole('option', { name: warehouse.name }))

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

/**
 * The shared quantity-line editor resolves an alternative unit's label from the
 * units-of-measure list, so the handler must exist once a material is picked.
 * The list is empty here because no material in this suite carries conversions.
 */
function unitsOfMeasureHandler() {
  return http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([]))
}

function usePageHandlers(store: WarehouseDocument[], nextSystemReference: () => string) {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])),
    http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material, assetMaterial])),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () => okJson([capability])),
    http.get(`${API_BASE_URL}/catalog/materials/:materialId/unit-conversions`, () => okJson([])),
    unitsOfMeasureHandler(),
    ...createReceivingSuppliersHandler(['Sham Co']),
    ...createCompleteDraftHandler({
      documentStore: () => store,
      lookups: useLookups(),
      nextSystemReference,
    }),
    // The paper pair is NOT part of `complete-draft`: it is written immediately
    // afterwards through its own guarded route.
    paperReferenceHandler(store),
  )
}

/** Applies the `paper-reference` write to the store, mirroring the live route. */
function paperReferenceHandler(store: WarehouseDocument[]) {
  return http.put(
    `${API_BASE_URL}/warehouse-documents/:documentId/paper-reference`,
    async ({ params, request }) => {
      const body = (await request.json()) as {
        expectedRowVersion: number
        paperDocumentNumber: string
        paperDocumentYear: number
      }
      const index = store.findIndex((item) => item.documentId === String(params['documentId']))
      if (index === -1) {
        return errJson(404, { code: 'WAREHOUSE_DOCUMENTS_NOT_FOUND' })
      }
      const current = store[index]!
      store[index] = {
        ...current,
        paperDocumentNumber: body.paperDocumentNumber,
        paperDocumentYear: body.paperDocumentYear,
        rowVersion: current.rowVersion + 1,
      }
      return okJson({})
    },
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
    expect(screen.getByText('يجب اختيار مورد صالح من القائمة.')).toBeInTheDocument()
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
    // The write carries the supplier's EXTERNAL-PARTY ID, never its display
    // name: the route binds `Guid SupplierPartyId`, and the server fixes the
    // receiving type to `Supplier` for every receiving draft.
    expect(created.receivingInfo).toMatchObject({ receivingType: 'Supplier' })
    expect(created.receivingInfo?.supplierRef).toBe(SUPPLIER_PARTY_ID)
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
        errJson(409, {
          code: 'WAREHOUSE_DOCUMENTS_PAPER_REFERENCE_REQUIRED',
          message: 'The paper document reference is missing or invalid.',
        }),
      ),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])),
      http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
      http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () => okJson([capability])),
      http.get(`${API_BASE_URL}/catalog/materials/:materialId/unit-conversions`, () => okJson([])),
      unitsOfMeasureHandler(),
      ...createReceivingSuppliersHandler(['Sham Co']),
    )

    const user = userEvent.setup()
    render(<ReceivingDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(
      await screen.findByText('يجب إدخال رقم المستند الورقي وسنته قبل التقديم.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('detail-stub')).not.toBeInTheDocument()
  })
})
