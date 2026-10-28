import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiJson, errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { wireMaterial } from '@/test/msw/catalog-wire-fixtures'

import { ROUTE_PATHS } from '@/config/routes'
import type { WarehouseInitializationStatus } from '@/modules/warehouse/types/warehouse.api-types'
import type { QuantityLineCapabilityGate } from '@/shared/documents/components/quantity-line-editor'
import type { WarehouseDocument } from '@/test/msw/document-engine.types'
import { formatArabicDate } from '@/shared/ui/calendar-utils'
import {
  createMaterial,
  createWarehouse,
  createWarehouseCapability,
  createWarehouseDocument,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { wireDocumentDetails } from '@/test/msw/document-wire-fixtures'
import { createCompleteDraftHandler } from '@/test/msw/warehouse-document-handlers'

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
const MATERIAL_DOMAIN_ID = fixtureUuid(20)
const MATERIAL_BASE_UNIT_ID = fixtureUuid(23)

/**
 * Materials in the REAL catalog wire shape — `wireMaterial` mints
 * `catalog.api-types.Material`, which is what `GET /catalog/materials` serves
 * and what the line editors' payload derivation reads: the flat
 * `materialDomainId` / `baseUnitId` / `baseUnitSymbol` pairs and the
 * identifier `id`.
 *
 * The retired local projection off the shared `createMaterial()` minted
 * `materialId` plus nested `domain` / `category` / `family` / `unit` / `rowVersion`
 * fields, so the picker's option value never matched the id the response
 * carried and no material could be selected.
 */
/**
 * The shared document-create handler embeds a material snapshot in its created
 * document, so its `materialOf` lookup answers with the catalog DTO that the
 * projection carries across the boundary.
 */
function generatedMaterialOf(materialId: string) {
  if (materialId === ASSET_MATERIAL_ID) {
    return createMaterial({
      id: materialId,
      code: 'IT-HW-PRT-201',
      nameAr: 'طابعة ليزر',
      materialKind: 'Asset',
      requiresAssetNumber: true,
      trackingType: 'Serial',
    })
  }
  return materialId === MATERIAL_ID ? createMaterial({ id: materialId }) : undefined
}

const warehouse = createWarehouse({ id: WAREHOUSE_ID })
const material = wireMaterial({
  id: MATERIAL_ID,
  nameAr: 'حاسوب مكتبي',
  materialDomainId: MATERIAL_DOMAIN_ID,
  baseUnitId: MATERIAL_BASE_UNIT_ID,
  baseUnitSymbol: 'قطعة',
})
const assetMaterial = wireMaterial({
  id: ASSET_MATERIAL_ID,
  code: 'IT-HW-PRT-201',
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
  materialDomainId: MATERIAL_DOMAIN_ID,
  materialDomainName: 'تقنية المعلومات',
  materialDomainCode: 'TEST',
  operations: ['Receiving', 'Issue', 'Opening'],
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

/**
 * The shared quantity-line editor resolves an alternative unit's label from the
 * units-of-measure list, so the handler must exist once a material is picked.
 * The list is empty here because no material in this suite carries conversions.
 */
function unitsOfMeasureHandler() {
  return http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([]))
}

function usePageHandlers(
  store: WarehouseDocument[],
  nextSystemReference: () => string,
  capabilityResponse = [capability],
  initializationStatus: WarehouseInitializationStatus = 'NotInitialized',
) {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])),
    // D-OPEN-02: the form reads the warehouse initialization state to decide
    // whether a new Opening draft is allowed at all. Without this handler the
    // read fails, and decision 3 means a failed read must leave the form usable
    // — so every other test in this suite would silently pass through the
    // "state unknown" path rather than the "state says no" path.
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/initialization`, () =>
      okJson({
        warehouseId: WAREHOUSE_ID,
        status: initializationStatus,
        sourceDocumentId:
          initializationStatus === 'ZeroStock' ? null : '00000000-0000-4000-8000-00000000aa01',
        asOfDate: initializationStatus === 'NotInitialized' ? null : '2024-01-01',
        isZeroStock: initializationStatus === 'ZeroStock',
        initializedAtUtc: initializationStatus === 'NotInitialized' ? null : '2024-01-02T10:00:00Z',
        initializedBy:
          initializationStatus === 'NotInitialized' ? null : '00000000-0000-4000-8000-00000000bb01',
        reversedAtUtc: null,
        reversedBy: null,
      }),
    ),
    http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material, assetMaterial])),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      okJson(capabilityResponse),
    ),
    http.get(`${API_BASE_URL}/catalog/materials/:materialId/unit-conversions`, () => okJson([])),
    unitsOfMeasureHandler(),
    ...createCompleteDraftHandler({
      documentStore: () => store,
      lookups: {
        materialOf: generatedMaterialOf,
        unitOf: () => undefined,
        warehouseOf: (warehouseId: string) =>
          warehouseId === WAREHOUSE_ID ? warehouse : undefined,
      },
      nextSystemReference,
    }),
    // The paper pair is NOT part of `complete-draft`: it is written immediately
    // afterwards through its own guarded route.
    paperReferenceHandler(store),
  )
}

/** Captures the `paper-reference` write so a test can assert what reached it. */
const paperReferenceWrites: unknown[] = []

function paperReferenceHandler(store: WarehouseDocument[]) {
  return http.put(
    `${API_BASE_URL}/warehouse-documents/:documentId/paper-reference`,
    async ({ params, request }) => {
      const body = await request.json()
      paperReferenceWrites.push(body)
      const index = store.findIndex((item) => item.documentId === String(params['documentId']))
      if (index === -1) {
        return errJson(404, { code: 'WAREHOUSE_DOCUMENTS_NOT_FOUND' })
      }
      const current = store[index]!
      const next = {
        ...current,
        paperDocumentNumber: (body as { paperDocumentNumber: string }).paperDocumentNumber,
        paperDocumentYear: (body as { paperDocumentYear: number }).paperDocumentYear,
        rowVersion: current.rowVersion + 1,
      }
      store[index] = next
      return okJson({})
    },
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  const openingAsOfDate = await fillHeader(user)

  const materialCombo = screen.getByRole('combobox', { name: 'المادة' })
  await user.click(materialCombo)
  await user.type(materialCombo, 'pc')
  await user.click(await screen.findByRole('option', { name: material.nameAr }))
  await user.type(screen.getByLabelText('الكمية'), '10')

  await user.click(screen.getByLabelText('نوع الافتتاحية للبند 1'))
  await user.click(await screen.findByRole('option', { name: 'افتتاحية أولية' }))

  return openingAsOfDate
}

async function fillHeader(user: ReturnType<typeof userEvent.setup>) {
  const warehouseCombo = screen.getByRole('combobox', { name: 'المستودع' })
  await user.click(warehouseCombo)
  await user.type(warehouseCombo, 'central')
  await user.click(await screen.findByRole('option', { name: warehouse.name }))

  await user.type(screen.getByLabelText('رقم المستند الورقي'), '2024/151')
  await user.type(screen.getByLabelText('السنة الورقية'), '2024')
  // D-OPEN-02 / PRD §6.4: the cut-off date the inventory represents is
  // mandatory for every Opening document. It is captured through the shared
  // Arabic picker, which stores the wire `YYYY-MM-DD` string in the form.
  const selected = new Date()
  await user.click(screen.getByRole('button', { name: 'تاريخ الرصيد الافتتاحي' }))
  await user.click(screen.getByRole('button', { name: formatArabicDate(selected) }))

  return dayjs(selected).format('YYYY-MM-DD')
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

  // Live API (2026-10-26): an Opening line is refused unless it carries
  // `openingType`; the first line therefore starts on `Initial`.
  it('preselects Initial on the first line so the common path needs no extra click', () => {
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    expect(screen.getByLabelText('نوع الافتتاحية للبند 1')).toHaveTextContent('افتتاحية أولية')
  })

  it('refuses to save when a line carries no openingType', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'OPEN-2026-0006')
    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)

    // A freshly added row starts blank; the requirement — not the first-line
    // default — is what has to stop the submit on it.
    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    expect(screen.getByLabelText('نوع الافتتاحية للبند 2')).toHaveTextContent('اختر النوع')

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('يجب اختيار نوع الافتتاحية لكل بند.')).toBeInTheDocument()
    expect(store).toHaveLength(0)
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
    // The paper pair never travels on the `complete-draft` command; it is written
    // through `PUT /{id}/paper-reference`, guarded on the version it issued.
    expect(paperReferenceWrites.at(-1)).toEqual({
      expectedRowVersion: 1,
      paperDocumentNumber: '2024/151',
      paperDocumentYear: 2024,
    })
    expect(store[0]).toMatchObject({ paperDocumentNumber: '2024/151', paperDocumentYear: 2024 })
  }, 10_000)

  // D-OPEN-02 (PRD §6.4): the cut-off date must leave the form on the
  // `complete-draft` payload itself — the CREATE request carries
  // `opening_as_of_date`, and there is no endpoint that can repair an Opening
  // draft after creation.
  it('sends header.openingAsOfDate on the complete-draft payload', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0009')
    const payloadBodies: unknown[] = []
    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, async ({ request }) => {
        payloadBodies.push(await request.json())
        const created = createWarehouseDocument({
          documentId: fixtureUuid(503),
          documentStatus: 'Draft',
          documentType: 'Opening',
        })
        store.push(created)
        return apiJson(wireDocumentDetails(created), { status: 201 })
      }),
      paperReferenceHandler(store),
    )

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    const openingAsOfDate = await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => expect(screen.getByTestId('detail-stub')).toBeInTheDocument())
    expect(payloadBodies).toHaveLength(1)
    expect(payloadBodies[0]).toMatchObject({
      documentType: 'Opening',
      warehouseId: WAREHOUSE_ID,
      openingAsOfDate,
    })
    expect(openingAsOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
  }, 10_000)

  it('saves an asset-only Opening draft, sending only what the contract can carry', async () => {
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
    // KNOWN CONTRACT GAP: `CompleteWarehouseDocumentDraftLine` has no per-unit
    // identity collection, so the captured asset numbers have nowhere to travel
    // and the draft carries the material and its unit count only.
    expect(store[0]?.lines[0]).toMatchObject({
      lineType: 'Asset',
      material: expect.objectContaining({ materialId: ASSET_MATERIAL_ID }),
      quantity: 2,
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
    })
  }, 10_000)

  it('blocks a POST when the selected material domain lacks the Opening capability', async () => {
    const store: WarehouseDocument[] = []
    const unsupportedCapability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      materialDomainId: material.materialDomainId,
      materialDomainName: material.materialDomainName,
      materialDomainCode: 'TEST',
      operations: ['Issue'],
    })
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0003', [unsupportedCapability])

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)

    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled())
    // The REAL capability-block copy comes from the line editor's
    // `validates(domainId, 'Receiving')` gate — the old expectation named a
    // per-domain sentence the product never renders.
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toStrictEqual([
      'العملية استلام غير مدعومة لهذا المستودع والمجال المطلوبين.',
      'العملية استلام غير مدعومة لهذا المستودع والمجال المطلوبين.',
    ])

    fireEvent.submit(openingForm())
    await waitFor(() => expect(store).toHaveLength(0))
    expect(screen.queryByTestId('detail-stub')).not.toBeInTheDocument()
  }, 10_000)

  it('blocks an asset-only Opening draft when its domain lacks Receiving capability', async () => {
    const store: WarehouseDocument[] = []
    const unsupportedCapability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      materialDomainId: assetMaterial.materialDomainId,
      materialDomainName: assetMaterial.materialDomainName,
      materialDomainCode: 'TEST',
      operations: ['Issue'],
    })
    usePageHandlers(store, () => 'EIAMS-OPN-2024-0007', [unsupportedCapability])

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حذف البند 1' }))
    await fillHeader(user)
    await fillAssetLine(user)

    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled())
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toStrictEqual([
      'العملية استلام غير مدعومة لهذا المستودع والمجال المطلوبين.',
      'العملية استلام غير مدعومة لهذا المستودع والمجال المطلوبين.',
    ])

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
        return okJson([capability])
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
        return okJson([capability])
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
      http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, () =>
        // "Already initialized" is a real, specific backend policy rejection:
        // OPENING_DOCUMENTS_ALREADY_INITIALIZED, 409 (OpeningDocumentsErrors.cs).
        // The invented `validation.failed` matched no code in the API, and the
        // bespoke titleAr hand-wrote Arabic the server cannot produce.
        errJson(409, { code: 'OPENING_DOCUMENTS_ALREADY_INITIALIZED' }),
      ),
      http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([warehouse])),
      http.get(`${API_BASE_URL}/catalog/materials`, () => okPageJson([material])),
      http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () => okJson([capability])),
      http.get(`${API_BASE_URL}/catalog/materials/:materialId/unit-conversions`, () => okJson([])),
      unitsOfMeasureHandler(),
    )

    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('سبق تهيئة الرصيد الافتتاحي لهذا المستودع.')).toBeInTheDocument()
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
      http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, async () => {
        requestCount += 1
        await pendingResponse
        const created = createWarehouseDocument({
          documentId: fixtureUuid(502),
          documentStatus: 'Draft',
          documentType: 'Opening',
        })
        store.push(created)
        // `complete-draft` answers the whole detail read.
        return apiJson(wireDocumentDetails(created), { status: 201 })
      }),
      paperReferenceHandler(store),
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

  // D-OPEN-02 (PRD §6.4) — the as-of-date is mandatory at submit time.
  it('refuses submit when openingAsOfDate is empty', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'OPEN-2026-0001')
    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillHeaderExceptOpeningAsOfDate(user)
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('تاريخ الرصيد الافتتاحي مطلوب.')).toBeInTheDocument()
    expect(store).toHaveLength(0)
  })

  // D-OPEN-02 (PRD §6.6) — zero quantity is rejected client-side.
  it('refuses a line with zero baseQuantity', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'OPEN-2026-0003')
    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillHeader(user)

    const materialCombo = screen.getByRole('combobox', { name: 'المادة' })
    await user.click(materialCombo)
    await user.type(materialCombo, 'pc')
    await user.click(await screen.findByRole('option', { name: material.nameAr }))

    const quantityInput = screen.getByLabelText('الكمية')
    await user.clear(quantityInput)
    await user.type(quantityInput, '0')

    await user.click(screen.getByLabelText('نوع الافتتاحية للبند 1'))
    await user.click(await screen.findByRole('option', { name: 'افتتاحية أولية' }))

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('يجب أن تكون الكمية أكبر من صفر.')).toBeInTheDocument()
    expect(store).toHaveLength(0)
  })

  // D-OPEN-02 (PRD §6.6) — negative quantity is rejected client-side.
  it('refuses a line with negative baseQuantity', async () => {
    const store: WarehouseDocument[] = []
    usePageHandlers(store, () => 'OPEN-2026-0004')
    const user = userEvent.setup()
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    await fillHeader(user)

    const materialCombo = screen.getByRole('combobox', { name: 'المادة' })
    await user.click(materialCombo)
    await user.type(materialCombo, 'pc')
    await user.click(await screen.findByRole('option', { name: material.nameAr }))

    const quantityInput = screen.getByLabelText('الكمية')
    await user.clear(quantityInput)
    await user.type(quantityInput, '-5')

    await user.click(screen.getByLabelText('نوع الافتتاحية للبند 1'))
    await user.click(await screen.findByRole('option', { name: 'افتتاحية أولية' }))

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('يجب أن تكون الكمية أكبر من صفر.')).toBeInTheDocument()
    expect(store).toHaveLength(0)
  })

  // D-OPEN-02 (CONFLICT-106 / PRD §6.7) — when the per-line capability gate
  // reports the new opening-capability-missing reason, the form renders a
  // dedicated chip with a deep link to the warehouse capability admin.
  it('renders the opening-capability chip when the gate reason is opening_capability_not_granted', () => {
    render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

    // The opening-policy notice + the new as-of-date field are always
    // visible; the dedicated capability chip is only visible when the
    // gate status is not `ready`.
    expect(screen.getByText('سياسة الرصيد الافتتاحي')).toBeInTheDocument()
    expect(screen.getByLabelText('تاريخ الرصيد الافتتاحي')).toBeInTheDocument()
    // D2: the as-of date uses the shared Arabic RTL picker, not a native
    // `<input type="date">` that renders English month/day/year segments.
    expect(document.querySelector('input[type="date"]')).toBeNull()
    expect(screen.queryByTestId('opening-capability-notice')).toBeNull()
  })

  // D-OPEN-02 (CONFLICT-106 / PRD §6.7) — the quantity-line capability gate
  // type now carries an optional `reason` field so the form can render a
  // stable chip keyed off the new OpeningCapabilityNotGranted code
  // without parsing Arabic messages.
  it('quantity-line capability gate type carries the optional reason field', () => {
    const readyGate: QuantityLineCapabilityGate = { status: 'ready' }
    const blockedGate: QuantityLineCapabilityGate = {
      status: 'blocked',
      messageAr: 'blocked',
      reason: 'opening_capability_not_granted',
    }
    const unverifiedGate: QuantityLineCapabilityGate = {
      status: 'unverified',
      messageAr: 'unverified',
    }
    expect(readyGate.status).toBe('ready')
    expect(blockedGate.status).toBe('blocked')
    expect(blockedGate.reason).toBe('opening_capability_not_granted')
    expect(unverifiedGate.status).toBe('unverified')
  })

  // D-OPEN-02 / PRD §6.2, §6.10: an Opening document is a one-time
  // initialization, not a routine document type. Once the warehouse carries an
  // Initialized state row — with a positive balance or through the explicit
  // zero-stock path — a new Opening draft is refused server-side, so the form
  // must refuse it before the user spends effort filling it in.
  describe('initialization-state gating (D-OPEN-02 §6.2/§6.10)', () => {
    it('disables save and explains why when the warehouse is already Initialized', async () => {
      const store: WarehouseDocument[] = []
      usePageHandlers(store, () => 'EIAMS-OPN-2024-0001', [capability], 'Initialized')

      const user = userEvent.setup()
      render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

      await fillValidForm(user)

      const save = await screen.findByRole('button', { name: 'حفظ المسودة' })
      await waitFor(() => expect(save).toBeDisabled())
      expect(
        await screen.findByText(
          'سبق تهيئة هذا المستودع برصيد افتتاحي، لذلك لا يمكن إنشاء سند افتتاحي جديد. تُسجَّل تصحيحات الرصيد عبر مستند تسوية.',
        ),
      ).toBeInTheDocument()
    })

    it('disables save and explains why when the warehouse was initialized with zero stock', async () => {
      const store: WarehouseDocument[] = []
      usePageHandlers(store, () => 'EIAMS-OPN-2024-0001', [capability], 'ZeroStock')

      const user = userEvent.setup()
      render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

      await fillValidForm(user)

      const save = await screen.findByRole('button', { name: 'حفظ المسودة' })
      await waitFor(() => expect(save).toBeDisabled())
      expect(
        await screen.findByText(
          'سبق تهيئة هذا المستودع على أنه فارغ، لذلك لا يمكن إنشاء سند افتتاحي جديد.',
        ),
      ).toBeInTheDocument()
    })

    it('does not write a draft when a blocked form is submitted anyway', async () => {
      // Defence in depth: `disabled` is not a boundary, so the submit handler
      // must apply the same rule. Removing the attribute here is what proves the
      // guard is in the handler and not only on the button.
      const store: WarehouseDocument[] = []
      usePageHandlers(store, () => 'EIAMS-OPN-2024-0001', [capability], 'Initialized')

      const user = userEvent.setup()
      render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

      await fillValidForm(user)

      const save = await screen.findByRole('button', { name: 'حفظ المسودة' })
      await waitFor(() => expect(save).toBeDisabled())
      save.removeAttribute('disabled')
      await user.click(save)

      expect(store).toHaveLength(0)
      expect(screen.queryByTestId('detail-stub')).toBeNull()
    })

    it('leaves save available when the warehouse is NotInitialized', async () => {
      const store: WarehouseDocument[] = []
      usePageHandlers(store, () => 'EIAMS-OPN-2024-0001', [capability], 'NotInitialized')

      const user = userEvent.setup()
      render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

      await fillValidForm(user)
      await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeEnabled())
      expect(screen.queryByText(/سبق تهيئة هذا المستودع/)).toBeNull()
    })

    it('leaves save available on a Reversed state, because the wire does not refuse re-initialization', async () => {
      // `Reversed` preserves the source document for audit and its contract note
      // says re-initialization is "not permitted by the default policy" — which
      // is not a refusal. Blocking here would be the browser inventing a rule.
      const store: WarehouseDocument[] = []
      usePageHandlers(store, () => 'EIAMS-OPN-2024-0001', [capability], 'Reversed')

      const user = userEvent.setup()
      render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

      await fillValidForm(user)
      await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeEnabled())
    })

    it('leaves the form usable when the initialization read cannot be answered', async () => {
      // Decision 3: the read is advisory. A 404 must not be invented into
      // "not initialized", and it must not block the form either — the server
      // remains the authority on the one-time rule and will refuse the write.
      const store: WarehouseDocument[] = []
      usePageHandlers(store, () => 'EIAMS-OPN-2024-0001')
      server.use(
        http.get(`${API_BASE_URL}/warehouses/:warehouseId/initialization`, () =>
          errJson(404, { code: 'RESOURCE_NOT_FOUND' }),
        ),
      )

      const user = userEvent.setup()
      render(<OpeningDocumentFormPage />, { wrapper: createWrapper() })

      await fillValidForm(user)
      await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeEnabled())
      expect(screen.queryByText(/سبق تهيئة هذا المستودع/)).toBeNull()
    })
  })
})

async function fillHeaderExceptOpeningAsOfDate(user: ReturnType<typeof userEvent.setup>) {
  const warehouseCombo = screen.getByRole('combobox', { name: 'المستودع' })
  await user.click(warehouseCombo)
  await user.type(warehouseCombo, 'central')
  await user.click(await screen.findByRole('option', { name: warehouse.name }))

  await user.type(screen.getByLabelText('رقم المستند الورقي'), '2024/151')
  await user.type(screen.getByLabelText('السنة الورقية'), '2024')
}
