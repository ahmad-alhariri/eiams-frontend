import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import ReturnDocumentFormPage from './return-document-form-page'
import { RETURN_REASON_MAX_LENGTH } from '@/modules/custody/schemas/return-info.schema'
import { wireMaterial } from '@/test/msw/catalog-wire-fixtures'
import { wireDocumentDetails, wireDocumentSummary } from '@/test/msw/document-wire-fixtures'
import {
  createNamedReference,
  createWarehouse,
  createWarehouseCapability,
  createWarehouseDocument,
  fixtureUuid,
} from '@/test/msw/factories'
import type { ReturnEligibleItem } from '@/modules/custody/types/return.types'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { ROUTE_PATHS } from '@/config/routes'
import { createQueryClient } from '@/shared/services/query.client'
import { formatNumber } from '@/shared/utils/format'

const API_BASE_URL = '/api/v1'
const ISSUE_DOC_ID = fixtureUuid(155)
const WRONG_ISSUE_DOC_ID = fixtureUuid(156)
const EMPTY_ISSUE_DOC_ID = fixtureUuid(157)
const RETURN_DOC_ID = fixtureUuid(170)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({ has: () => true }),
}))

const WAREHOUSE_ID = fixtureUuid(30)
const WRONG_WAREHOUSE_ID = fixtureUuid(31)
const WAREHOUSE = createWarehouse({ id: WAREHOUSE_ID })
// FIX-R2: the Return page opts into Asset-kind materials, which arrive with
// the consumable kind in the same catalog projection.
const ASSET_MATERIAL = wireMaterial({
  id: fixtureUuid(41),
  materialKind: 'Asset',
  requiresAssetNumber: true,
  trackingType: 'Serial',
  nameAr: 'حاسوب محمول',
})
const CONSUMABLE_MATERIAL = wireMaterial({
  id: fixtureUuid(42),
  nameAr: 'ورق طباعة',
})
// o098.5: durable custody subjects the Return line picker must now serve.
const DURABLE_QTY_MATERIAL = wireMaterial({
  id: fixtureUuid(43),
  materialKind: 'Durable',
  trackingType: 'Quantity',
  nameAr: 'أسطوانة غاز',
})
const DURABLE_SERIAL_MATERIAL = wireMaterial({
  id: fixtureUuid(44),
  materialKind: 'Durable',
  trackingType: 'Serial',
  nameAr: 'جهاز قياس',
})
// The Issue holds no custody of it: the server refuses a line of it, so the
// material picker must not offer it.
const DURABLE_NO_CUSTODY_MATERIAL = wireMaterial({
  id: fixtureUuid(45),
  materialKind: 'Durable',
  trackingType: 'Quantity',
  nameAr: 'بطارية احتياطية',
})

const ASSET_A_ID = fixtureUuid(60)
const ASSET_B_ID = fixtureUuid(61)
const SERIAL_UNIT_A = 'SN-DUR-0001'
const SERIAL_UNIT_B = 'SN-DUR-0002'

function eligibleAsset(assetSequence: number, subjectId: string): ReturnEligibleItem {
  return {
    subjectType: 'Asset',
    subjectId,
    materialId: ASSET_MATERIAL.id,
    materialNameAr: ASSET_MATERIAL.nameAr,
    materialNameEn: 'Laptop Computer',
    materialCode: ASSET_MATERIAL.code,
    materialKind: 'Asset',
    trackingType: 'Serial',
    serialNumber: `SN-${assetSequence}`,
    assetNumber: `AST-2026-${assetSequence.toString().padStart(4, '0')}`,
    availableQuantity: 1,
    issuedQuantity: 1,
  }
}

function eligibleDurableQuantity(): ReturnEligibleItem {
  return {
    subjectType: 'MaterialQuantity',
    subjectId: fixtureUuid(71),
    materialId: DURABLE_QTY_MATERIAL.id,
    materialNameAr: DURABLE_QTY_MATERIAL.nameAr,
    materialNameEn: 'Gas Cylinder',
    materialCode: DURABLE_QTY_MATERIAL.code,
    materialKind: 'Durable',
    trackingType: 'Quantity',
    serialNumber: null,
    assetNumber: null,
    availableQuantity: 3,
    issuedQuantity: 10,
  }
}

function eligibleDurableUnit(serialNumber: string, subjectId: string): ReturnEligibleItem {
  return {
    subjectType: 'TrackedUnit',
    subjectId,
    materialId: DURABLE_SERIAL_MATERIAL.id,
    materialNameAr: DURABLE_SERIAL_MATERIAL.nameAr,
    materialNameEn: 'Measuring Device',
    materialCode: DURABLE_SERIAL_MATERIAL.code,
    materialKind: 'Durable',
    trackingType: 'Serial',
    serialNumber,
    assetNumber: null,
    availableQuantity: 1,
    issuedQuantity: 1,
  }
}

/** The posted Issue the option list offers, in the live wire list shape. */
function postedIssue(documentId: string, warehouseId: string, sequence: number) {
  const padded = sequence.toString().padStart(4, '0')
  return wireDocumentSummary(
    createWarehouseDocument({
      documentId,
      documentType: 'Issue',
      documentStatus: 'Posted',
      warehouse: createNamedReference({ id: warehouseId, displayName: 'مستودع' }),
      systemReferenceNumber: `EIAMS-ISS-2026-${padded}`,
      paperDocumentNumber: `ISSUE-2026-${padded}`,
      paperDocumentYear: 2026,
    }),
  )
}

const MATCHED_ISSUE = postedIssue(ISSUE_DOC_ID, WAREHOUSE_ID, 1)
const WRONG_WAREHOUSE_ISSUE = postedIssue(WRONG_ISSUE_DOC_ID, WRONG_WAREHOUSE_ID, 2)
// Same warehouse, but the Issue holds no custody at all.
const EMPTY_ISSUE = postedIssue(EMPTY_ISSUE_DOC_ID, WAREHOUSE_ID, 3)

async function fillHeader(user: ReturnType<typeof userEvent.setup>) {
  const warehouseCombo = screen.getByRole('combobox', { name: 'المستودع' })
  await user.click(warehouseCombo)
  await user.type(warehouseCombo, 'central')
  await user.click(await screen.findByText(WAREHOUSE.name))

  await user.type(screen.getByLabelText('رقم المستند الورقي'), '2024/151')
  await user.type(screen.getByLabelText('السنة الورقية'), '2024')
}

/** Picks the ORIGINAL ISSUE for the petal through the new selector (FIX-R3). */
async function pickOriginalIssue(user: ReturnType<typeof userEvent.setup>, sequence: number) {
  const padded = sequence.toString().padStart(4, '0')
  const issueCombo = screen.getByLabelText('سند الصرف الأصلي')
  // The system reference is the identifier the option label leads with, so it
  // is the one the selector searches (and the one the server filters on).
  await user.type(issueCombo, `EIAMS-ISS-2026-${padded}`)
  const options = await screen.findAllByRole('option')
  const target = options.find((option) =>
    (option.textContent ?? '').includes(`EIAMS-ISS-2026-${padded}`),
  )
  expect(target).toBeDefined()
  if (target) {
    await user.click(target)
  }
}

async function selectMaterial(user: ReturnType<typeof userEvent.setup>, nameAr: string) {
  const materialCombo = screen.getByRole('combobox', { name: 'المادة' })
  await user.click(materialCombo)
  await user.type(materialCombo, nameAr)
  const options = await screen.findAllByRole('option')
  const target = options.find((option) => (option.textContent ?? '').includes(nameAr))
  expect(target).toBeDefined()
  if (target) {
    await user.click(target)
  }
}

/** MSW handler set for the whole page. Returns the captured complete-draft writes. */
function useDocumentHandlers() {
  const writes: { completeDraftCalls: number; lastCompleteDraft: Record<string, unknown> | null } =
    {
      completeDraftCalls: 0,
      lastCompleteDraft: null,
    }
  server.use(
    // Header section fetches warehouse options for the source-warehouse select.
    http.get(`${API_BASE_URL}/warehouses`, () => okPageJson([WAREHOUSE])),
    http.get(`${API_BASE_URL}/catalog/materials`, () =>
      okPageJson([
        CONSUMABLE_MATERIAL,
        ASSET_MATERIAL,
        DURABLE_QTY_MATERIAL,
        DURABLE_SERIAL_MATERIAL,
        DURABLE_NO_CUSTODY_MATERIAL,
      ]),
    ),
    // The line editor resolves an alternative unit's label from the real
    // units-of-measure list; empty here because this suite carries no
    // conversions.
    http.get(`${API_BASE_URL}/catalog/units-of-measure`, () => okPageJson([])),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId/capabilities`, () =>
      okJson([
        createWarehouseCapability({
          warehouseId: WAREHOUSE_ID,
          materialDomainId: ASSET_MATERIAL.materialDomainId,
          materialDomainName: ASSET_MATERIAL.materialDomainName,
          materialDomainCode: 'TEST',
          operations: ['Return', 'Issue', 'Receiving'],
        }),
      ]),
    ),
    // FIX-R3: the original-issue selector searches POSTED Issue documents by
    // the server-side `Contains` filter on the system reference — the
    // identifier the option label leads with; no warehouse filter is sent.
    http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('documentType')).toBe('Issue')
      expect(url.searchParams.get('documentStatus')).toBe('Posted')
      const systemQuery = url.searchParams.get('systemReferenceNumber')
      const paperQuery = url.searchParams.get('paperDocumentNumber')
      const all = [MATCHED_ISSUE, WRONG_WAREHOUSE_ISSUE, EMPTY_ISSUE]
      return okPageJson(
        all.filter(
          (row) =>
            (systemQuery === null || (row.systemReferenceNumber ?? '').includes(systemQuery)) &&
            (paperQuery === null || (row.paperDocumentNumber ?? '').includes(paperQuery)),
        ),
      )
    }),
    // FIX-R2: the per-line selector reads the eligible-items route; o098.5
    // adds the durable quantity allocation and the serial-tracked units. The
    // route carries CUSTODY subjects only (assets, durable units, durable
    // allocations) — a consumable never appears in it.
    http.get(`${API_BASE_URL}/returns/eligible-items`, ({ request }) => {
      const url = new URL(request.url)
      const issueId = url.searchParams.get('originalIssueDocumentId')
      if (issueId === WRONG_ISSUE_DOC_ID || issueId === EMPTY_ISSUE_DOC_ID) {
        return okPageJson([])
      }
      return okPageJson([
        eligibleAsset(1, ASSET_A_ID),
        eligibleAsset(2, ASSET_B_ID),
        eligibleDurableQuantity(),
        eligibleDurableUnit(SERIAL_UNIT_A, fixtureUuid(72)),
        eligibleDurableUnit(SERIAL_UNIT_B, fixtureUuid(73)),
      ])
    }),
    // A form with lines to save must use `complete-draft`: it is the only write
    // that creates a document together with its lines, and it answers the whole
    // detail read. The bare `POST /warehouse-documents` creates an EMPTY document
    // and answers `201 { id }`.
    http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, async ({ request }) => {
      writes.completeDraftCalls += 1
      writes.lastCompleteDraft = (await request.json()) as Record<string, unknown>
      return okJson(
        wireDocumentDetails(
          createWarehouseDocument({
            documentId: RETURN_DOC_ID,
            documentType: 'Return',
            documentStatus: 'Draft',
            systemReferenceNumber: 'EIAMS-RTN-2026-0001',
          }),
        ),
      )
    }),
    // The paper number/year are NOT part of the draft command; they live on
    // their own route, so the form writes them in a second call after the
    // document exists.
    http.put(`${API_BASE_URL}/warehouse-documents/${RETURN_DOC_ID}/paper-reference`, () =>
      okJson({}),
    ),
  )
  return writes
}

function renderPage() {
  // A fresh client per test — the eligible-items lookup is scoped+keyed by the
  // issue id, and one shared cache would make tests read each other's fixtures.
  const client = createQueryClient()
  return render(<ReturnDocumentFormPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[ROUTE_PATHS.documentReturnNew]}>
          <Routes>
            <Route path={ROUTE_PATHS.documentReturnNew} element={children} />
            <Route
              path={ROUTE_PATHS.documentReturnDetail}
              element={<div data-testid="detail-stub">DETAIL-LANDING</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

describe('ReturnDocumentFormPage (FIX-R1..FIX-R5)', () => {
  it('renders the spine, the original-issue selector, reason field, and save action', async () => {
    useDocumentHandlers()
    renderPage()

    expect(await screen.findByText('سند إرجاع جديد')).toBeInTheDocument()
    // FIX-R3: no raw uuid input remains; the field is a server-fed selector.
    expect(screen.getByLabelText('سند الصرف الأصلي')).toHaveAttribute(
      'id',
      'original-issue-document',
    )
    expect(screen.queryByText('معرّف سند الصرف الأصلي')).not.toBeInTheDocument()
    expect(screen.getByLabelText('سبب الإرجاع')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeInTheDocument()
  })

  it('blocks submission without the mandatory original-issue id and reason', async () => {
    useDocumentHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند إرجاع جديد')
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('يجب إدخال معرّف سند الصرف الأصلي.')).toBeInTheDocument()
    expect(screen.getByText('يجب إدخال سبب الإرجاع.')).toBeInTheDocument()
  })

  it(
    'posts a contract-shaped Return draft (documentType Return + the picked issue id) and navigates',
    { timeout: 20000 },
    async () => {
      const writes = useDocumentHandlers()
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('سند إرجاع جديد')
      await fillHeader(user)
      await pickOriginalIssue(user, 1)
      await selectMaterial(user, CONSUMABLE_MATERIAL.nameAr)
      await user.type(screen.getByLabelText('الكمية'), '5')
      await user.type(screen.getByLabelText('سبب الإرجاع'), 'عودة المواد بعد انتهاء الحاجة')

      await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
      await waitFor(
        () => {
          expect(screen.getByText('DETAIL-LANDING')).toBeInTheDocument()
        },
        { timeout: 8000 },
      )

      const returnInfo = writes.lastCompleteDraft?.['returnInfo'] as Record<string, unknown>
      expect(writes.lastCompleteDraft?.['documentType']).toBe('Return')
      expect(returnInfo['originalIssueDocumentId']).toBe(ISSUE_DOC_ID)
      // FIX-R4: the petal carries ONLY the id and the reason.
      expect(Object.keys(returnInfo).sort()).toEqual(['originalIssueDocumentId', 'returnReason'])
    },
  )

  it(
    'sends the selected assetIds of an Asset-kind line in the CompleteDraftRequest',
    { timeout: 20000 },
    async () => {
      const writes = useDocumentHandlers()
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('سند إرجاع جديد')
      await fillHeader(user)
      await pickOriginalIssue(user, 1)
      await selectMaterial(user, ASSET_MATERIAL.nameAr)
      await user.type(screen.getByLabelText('الكمية'), '2')

      // FIX-R2: the per-line eligible-asset chips; selecting exactly the line
      // quantity clears the page-level mismatch guard and enables the save.
      await user.click(await screen.findByRole('checkbox', { name: 'AST-2026-0001 — حاسوب محمول' }))
      await user.click(screen.getByRole('checkbox', { name: 'AST-2026-0002 — حاسوب محمول' }))

      await user.type(screen.getByLabelText('سبب الإرجاع'), 'إرجاع أصائل فائضة عن الحاجة')
      await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
      await waitFor(
        () => {
          expect(screen.getByText('DETAIL-LANDING')).toBeInTheDocument()
        },
        { timeout: 8000 },
      )

      const lines = writes.lastCompleteDraft?.['lines'] as readonly Record<string, unknown>[]
      expect(lines[0]?.['assetIds']).toEqual([ASSET_A_ID, ASSET_B_ID])
    },
  )

  it(
    'caps a quantity-tracked Durable return at the remaining custody and sends the partial quantity',
    { timeout: 20000 },
    async () => {
      const writes = useDocumentHandlers()
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('سند إرجاع جديد')
      await fillHeader(user)
      await pickOriginalIssue(user, 1)
      await selectMaterial(user, DURABLE_QTY_MATERIAL.nameAr)
      fireEvent.change(screen.getByLabelText('الكمية'), { target: { value: '5' } })
      await user.type(screen.getByLabelText('سبب الإرجاع'), 'إرجاع جزء من العهدة')

      expect(
        await screen.findByText(
          `البند 1: الكمية المطلوبة تتجاوز الكمية المتبقية في العهدة (${formatNumber(3)}).`,
        ),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled()

      await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
      expect(writes.completeDraftCalls).toBe(0)

      fireEvent.change(screen.getByLabelText('الكمية'), { target: { value: '2' } })
      await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeEnabled())

      await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
      await waitFor(
        () => {
          expect(screen.getByText('DETAIL-LANDING')).toBeInTheDocument()
        },
        { timeout: 8000 },
      )

      // Only fields the backend binds for a quantity-tracked durable line.
      const lines = writes.lastCompleteDraft?.['lines'] as readonly Record<string, unknown>[]
      expect(lines[0]).toEqual({ materialId: DURABLE_QTY_MATERIAL.id, quantity: 2 })
    },
  )

  it(
    'sends the selected serial unit on batchNumber with quantity 1 for a serial Durable',
    { timeout: 20000 },
    async () => {
      const writes = useDocumentHandlers()
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('سند إرجاع جديد')
      await fillHeader(user)
      await pickOriginalIssue(user, 1)
      await selectMaterial(user, DURABLE_SERIAL_MATERIAL.nameAr)

      expect(
        await screen.findByText('البند 1: اختر الوحدة التسلسلية المراد إرجاعها.'),
      ).toBeInTheDocument()

      await user.click(
        await screen.findByRole('radio', {
          name: `${SERIAL_UNIT_B} — ${DURABLE_SERIAL_MATERIAL.nameAr}`,
        }),
      )
      await waitFor(() => expect(screen.getByLabelText('الكمية')).toHaveValue(1))

      await user.type(screen.getByLabelText('سبب الإرجاع'), 'إرجاع جهاز قياس')
      await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
      await waitFor(
        () => {
          expect(screen.getByText('DETAIL-LANDING')).toBeInTheDocument()
        },
        { timeout: 8000 },
      )

      const lines = writes.lastCompleteDraft?.['lines'] as readonly Record<string, unknown>[]
      expect(lines[0]).toEqual({
        batchNumber: SERIAL_UNIT_B,
        materialId: DURABLE_SERIAL_MATERIAL.id,
        quantity: 1,
      })
    },
  )

  it(
    'blocks a durable line whose material the original Issue holds no custody of',
    { timeout: 20000 },
    async () => {
      const writes = useDocumentHandlers()
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('سند إرجاع جديد')
      await fillHeader(user)
      // The material is picked FIRST, then an original Issue that holds no
      // custody of it: the line survives with a material the server refuses
      // (`DurableAllocationNotFound`), so the save must stay blocked.
      await selectMaterial(user, DURABLE_QTY_MATERIAL.nameAr)
      await pickOriginalIssue(user, 3)
      fireEvent.change(screen.getByLabelText('الكمية'), { target: { value: '1' } })
      await user.type(screen.getByLabelText('سبب الإرجاع'), 'محاولة إرجاع بلا عهدة')

      expect(
        await screen.findByText(
          'البند 1: لا توجد عهدة متبقية قابلة للإرجاع لهذه المادة في سند الصرف الأصلي.',
        ),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled()

      await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
      expect(writes.completeDraftCalls).toBe(0)
    },
  )

  it('offers only the materials the selected original Issue can return', async () => {
    useDocumentHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند إرجاع جديد')
    await fillHeader(user)
    // A durable line first: its per-line slot mirrors the eligible rows, so it
    // tells the test that the eligible-items read has resolved and the picker
    // is narrowed by it.
    await selectMaterial(user, DURABLE_QTY_MATERIAL.nameAr)
    await pickOriginalIssue(user, 1)
    await screen.findByText(/الكمية المتبقية في العهدة/)

    const materialCombo = screen.getByRole('combobox', { name: 'المادة' })
    await user.clear(materialCombo)
    await user.type(materialCombo, 'مادة')
    const offered = await waitFor(
      () => {
        const names = screen.queryAllByRole('option').map((option) => option.textContent ?? '')
        // The Issue holds the asset → it stays offerable.
        expect(names.some((name) => name.includes(ASSET_MATERIAL.nameAr))).toBe(true)
        // A durable the Issue never issued holds no custody: the server
        // refuses the line, so the picker must not offer it.
        expect(names.some((name) => name.includes(DURABLE_NO_CUSTODY_MATERIAL.nameAr))).toBe(false)
        return names
      },
      { timeout: 8000 },
    )

    // The Issue holds both durables → they stay offerable.
    expect(offered.some((name) => name.includes(DURABLE_QTY_MATERIAL.nameAr))).toBe(true)
    expect(offered.some((name) => name.includes(DURABLE_SERIAL_MATERIAL.nameAr))).toBe(true)
    // A consumable carries no custody subject: the server accepts it.
    expect(offered.some((name) => name.includes(CONSUMABLE_MATERIAL.nameAr))).toBe(true)
  })

  it('waits for the custody lookup before saving a Durable line', { timeout: 20000 }, async () => {
    const writes = useDocumentHandlers()
    let releaseEligibleItems: () => void = () => {}
    const eligibleItemsGate = new Promise<void>((resolve) => {
      releaseEligibleItems = resolve
    })
    server.use(
      http.get(`${API_BASE_URL}/returns/eligible-items`, async () => {
        await eligibleItemsGate
        return okPageJson([eligibleDurableQuantity()])
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند إرجاع جديد')
    await fillHeader(user)
    await pickOriginalIssue(user, 1)
    await selectMaterial(user, DURABLE_QTY_MATERIAL.nameAr)
    fireEvent.change(screen.getByLabelText('الكمية'), { target: { value: '1' } })
    await user.type(screen.getByLabelText('سبب الإرجاع'), 'إرجاع جزء من العهدة')

    expect(
      await screen.findByText('جارٍ التحقق من العهدة المتبقية لبنود العهدة قبل الحفظ.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled()

    releaseEligibleItems()
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeEnabled()
      },
      { timeout: 8000 },
    )
    expect(writes.completeDraftCalls).toBe(0)
  })

  it('blocks a 201-character reason client-side without issuing the save', async () => {
    const writes = useDocumentHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند إرجاع جديد')
    await fillHeader(user)
    await pickOriginalIssue(user, 1)
    await selectMaterial(user, CONSUMABLE_MATERIAL.nameAr)
    await user.type(screen.getByLabelText('الكمية'), '5')
    // maxLength=200 stops the keyboard, but a programmatic overflow (paste
    // bypasses maxLength in some agents) must still be caught by the schema.
    fireEvent.change(screen.getByLabelText('سبب الإرجاع'), {
      target: { value: 'ر'.repeat(RETURN_REASON_MAX_LENGTH + 1) },
    })

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    expect(await screen.findByText('يجب ألا يتجاوز سبب الإرجاع 200 محرفاً.')).toBeInTheDocument()
    await waitFor(() => expect(writes.completeDraftCalls).toBe(0))
  })

  it('rejects a wrong-warehouse issue client-side with the Arabic message and no save', async () => {
    const writes = useDocumentHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند إرجاع جديد')
    await fillHeader(user)
    await pickOriginalIssue(user, 2)
    await user.type(screen.getByLabelText('سبب الإرجاع'), 'سبب كافٍ للإرجاع')

    expect(
      await screen.findByText('مستودع سند الإرجاع يجب أن يطابق مستودع سند الصرف الأصلي.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
    expect(writes.completeDraftCalls).toBe(0)
  })

  it('blocks an implicit (Enter) submit while the wrong-warehouse guard is active', async () => {
    const writes = useDocumentHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('سند إرجاع جديد')
    await fillHeader(user)
    await pickOriginalIssue(user, 2)

    // Wrong-warehouse guard active, asset guard not yet relevant. Fire an
    // Enter on the reason field: this is the implicit form submit that the
    // (disabled) save button cannot intercept, and the proxy for any
    // programmatic `form.submit()` path.
    const reason = screen.getByLabelText('سبب الإرجاع')
    await user.type(reason, 'سبب كافٍ للإرجاع{Enter}')

    await waitFor(() => expect(writes.completeDraftCalls).toBe(0))
  })
})
