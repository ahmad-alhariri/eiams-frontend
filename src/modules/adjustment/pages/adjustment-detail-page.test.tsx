import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiJson, okJson } from '@/test/msw/envelope'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import AdjustmentDetailPage from './adjustment-detail-page'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { AdjustmentDetail } from '@/modules/adjustment/types/adjustment.types'
import type {
  DocumentActionAvailability,
  DocumentPolicy,
  DocumentPolicyBlocker,
  WarehouseDocumentDetails,
} from '@/shared/documents/types/document-wire.types'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createSessionUser, createSessionRole, createSessionScope } from '@/test/msw/factories'

vi.mock('@/shared/ui/toast-manager', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const ADJUSTMENT_ID = '423e4567-e89b-42d3-a456-426614174004'
// On the server the adjustment's own id IS the document id the shared
// document engine keys policy and attachments by.
const DOCUMENT_ID = ADJUSTMENT_ID

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'مدير المستودع' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

function postAvailability(signedOriginalSatisfied: boolean): DocumentActionAvailability {
  return {
    action: 'Post',
    allowed: signedOriginalSatisfied,
    confirmationRequired: false,
    presentation: signedOriginalSatisfied ? 'Enabled' : 'Disabled',
    reasonCode: signedOriginalSatisfied ? null : 'document.signed_original_missing',
    reason: signedOriginalSatisfied ? null : 'يلزم رفع النسخة الموقعة من السند.',
    reasonRequired: false,
  }
}

const SIGNED_MISSING_BLOCKER: DocumentPolicyBlocker = {
  action: 'Post',
  code: 'document.signed_original_missing',
  message: 'يلزم رفع النسخة الموقعة من السند قبل الترحيل.',
}

function wirePolicy(input: {
  documentStatus: 'Draft' | 'Posted'
  signedOriginalSatisfied: boolean
}): DocumentPolicy {
  return {
    documentId: DOCUMENT_ID,
    status: input.documentStatus,
    rowVersion: 1,
    evaluatedAtUtc: '2026-08-26T08:05:00.000Z',
    signedOriginalSatisfied: input.signedOriginalSatisfied,
    actions:
      input.documentStatus === 'Draft' ? [postAvailability(input.signedOriginalSatisfied)] : [],
    blockers: input.signedOriginalSatisfied ? [] : [SIGNED_MISSING_BLOCKER],
    warnings: [],
  }
}

function wireDocumentDetail(input: {
  documentStatus: 'Draft' | 'Posted'
  withSignedOriginal: boolean
}): WarehouseDocumentDetails {
  return {
    id: DOCUMENT_ID,
    warehouseId: '823e4567-e89b-42d3-a456-426614174008',
    warehouseCode: 'WH-01',
    warehouseName: 'المستودع المركزي',
    documentType: 'Adjustment',
    paperDocumentNumber: null,
    paperDocumentYear: null,
    systemReferenceNumber: 'EIAMS-ADJ-DRAFT-0001',
    signedCopyAttachmentId: null,
    documentStatus: input.documentStatus,
    createdAtUtc: '2026-08-26T08:00:00.000Z',
    createdBy: '923e4567-e89b-42d3-a456-426614174009',
    postedBy: null,
    postedAtUtc: input.documentStatus === 'Posted' ? '2026-08-26T09:00:00.000Z' : null,
    reversalOfDocumentId: null,
    reversedByDocumentId: null,
    rowVersion: 2,
    receivingInfo: null,
    issueTo: null,
    transferInfo: null,
    returnInfo: null,
    inventoryAdjustment: null,
    lines: [],
    attachments: input.withSignedOriginal
      ? [
          {
            id: '623e4567-e89b-42d3-a456-426614174006',
            attachmentType: 'SignedOriginal',
            originalFilename: 'الصل-الموقع.pdf',
            mimeType: 'application/pdf',
            fileSize: 2048,
            uploadedAtUtc: '2026-08-26T08:04:00.000Z',
          },
        ]
      : [],
    openingAsOfDate: null,
    openingIsZeroStock: false,
  }
}

function draftFixture(input: {
  purpose: 'DirectCorrection' | 'Disposal'
  status: 'Draft' | 'Posted'
  signedOriginalSatisfied: boolean
}): AdjustmentDetail {
  const isPosted = input.status === 'Posted'
  const purpose = input.purpose
  if (purpose === 'Disposal') {
    return {
      id: ADJUSTMENT_ID,
      warehouseId: '823e4567-e89b-42d3-a456-426614174008',
      warehouseCode: 'WH-01',
      warehouseName: 'المستودع المركزي',
      countId: null,
      purpose,
      status: input.status,
      reason: 'تسوية عجز إدخال بعد جرد المستودع المركزي',
      systemReferenceNumber: 'EIAMS-ADJ-DRAFT-0001',
      documentStatus: input.status,
      createdAtUtc: '2026-08-26T08:00:00.000Z',
      postedAtUtc: isPosted ? '2026-08-26T09:00:00.000Z' : null,
      rowVersion: 2,
      lines: [
        {
          lineId: '623e4567-e89b-42d3-a456-426614174006',
          materialId: '723e4567-e89b-42d3-a456-426614174007',
          materialCode: 'MAT-ASSET-1',
          materialNameAr: 'حاسوب مكتبي',
          quantity: -1,
          difference: -1,
          reason: 'إعدام أصل تالف بموجب محضر اللجنة.',
          assets: [
            {
              id: '833e4567-e89b-42d3-a456-426614174010',
              assetNumber: 'AST-2026-1002',
              serialNumber: null,
            },
          ],
        },
      ],
    }
  }
  return {
    id: ADJUSTMENT_ID,
    warehouseId: '823e4567-e89b-42d3-a456-426614174008',
    warehouseCode: 'WH-01',
    warehouseName: 'المستودع المركزي',
    countId: null,
    purpose,
    status: input.status,
    reason: 'تسوية عجز إدخال بعد جرد المستودع المركزي',
    systemReferenceNumber: 'EIAMS-ADJ-DRAFT-0001',
    documentStatus: input.status,
    createdAtUtc: '2026-08-26T08:00:00.000Z',
    postedAtUtc: isPosted ? '2026-08-26T09:00:00.000Z' : null,
    rowVersion: 2,
    lines: [
      {
        lineId: '623e4567-e89b-42d3-a456-426614174006',
        materialId: '723e4567-e89b-42d3-a456-426614174007',
        materialCode: 'MAT-ASSET-1',
        materialNameAr: 'حاسوب مكتبي',
        quantity: 7,
        difference: -3,
        reason: 'عجز مؤكد بمراجعة اللجنة',
        assets: [],
      },
    ],
  }
}

function useDetailHandlers(input: {
  adjustment: AdjustmentDetail
  documentStatus: 'Draft' | 'Posted'
  signedOriginalSatisfied: boolean
}) {
  server.use(
    http.get(`*/api/v1/adjustments/${ADJUSTMENT_ID}`, () => okJson(input.adjustment)),
    http.get(`*/api/v1/warehouse-documents/${DOCUMENT_ID}`, () =>
      okJson(
        wireDocumentDetail({
          documentStatus: input.documentStatus,
          withSignedOriginal: input.signedOriginalSatisfied,
        }),
      ),
    ),
    http.get(`*/api/v1/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
      okJson(
        wirePolicy({
          documentStatus: input.documentStatus,
          signedOriginalSatisfied: input.signedOriginalSatisfied,
        }),
      ),
    ),
  )
}

function renderPage(
  permissionCodes: readonly string[] = [
    'document.view',
    'document.create',
    'document.post',
    'document.reverse',
  ],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return render(
    <MemoryRouter initialEntries={[`/adjustments/${ADJUSTMENT_ID}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/adjustments/:adjustmentId" element={<AdjustmentDetailPage />} />
          <Route path="/adjustments" element={<p>القائمة</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('AdjustmentDetailPage (e21-t07)', () => {
  it('renders the server read model: header fields, signed lines, attachment row', async () => {
    useDetailHandlers({
      adjustment: draftFixture({
        purpose: 'DirectCorrection',
        status: 'Draft',
        signedOriginalSatisfied: true,
      }),
      documentStatus: 'Draft',
      signedOriginalSatisfied: true,
    })
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: /تفاصيل سند التسوية/ }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/EIAMS-ADJ-DRAFT-0001/)).toBeInTheDocument()
    expect(screen.getByText('تسوية مباشرة')).toBeInTheDocument()
    expect(screen.getByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText('-3')).toBeInTheDocument()
    expect(screen.getByText('عجز مؤكد بمراجعة اللجنة')).toBeInTheDocument()
    expect(screen.getByText('المستودع المركزي')).toBeInTheDocument()
    expect(screen.getByText('الصل-الموقع.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeEnabled()
  })

  it('shows the posting action disabled to a manager on a Draft whose signed original is missing', async () => {
    useDetailHandlers({
      adjustment: draftFixture({
        purpose: 'DirectCorrection',
        status: 'Draft',
        signedOriginalSatisfied: false,
      }),
      documentStatus: 'Draft',
      signedOriginalSatisfied: false,
    })
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeDisabled()
    // The SignedOriginal blocker is surfaced from the shared policy read.
    expect(screen.getByText('يلزم رفع النسخة الموقعة من السند قبل الترحيل.')).toBeInTheDocument()
  })

  it('marks a posted disposal as terminal with no reversal affordance', async () => {
    useDetailHandlers({
      adjustment: draftFixture({
        purpose: 'Disposal',
        status: 'Posted',
        signedOriginalSatisfied: true,
      }),
      documentStatus: 'Posted',
      signedOriginalSatisfied: true,
    })
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('إعدام أصل')).toBeInTheDocument()
    expect(screen.getByText('سند إعدام مرحّل لا يقبل العكس')).toBeInTheDocument()
    expect(screen.getByText(/AST-2026-1002/)).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(table.parentElement).toHaveClass('overflow-x-auto')
    expect(table.closest('[data-slot="content-card"]')?.parentElement).toHaveClass('grid-cols-1')
    expect(screen.queryByRole('button', { name: 'عكس السند' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'ترحيل السند' })).toBeNull()
  })

  it('shows the error state when the detail request fails', async () => {
    server.use(
      http.get(`*/api/v1/adjustments/${ADJUSTMENT_ID}`, () =>
        apiJson({ title: 'x' }, { status: 500 }),
      ),
    )
    renderPage()

    expect(await screen.findByText('تعذّر تحميل سند التسوية')).toBeInTheDocument()
  })

  // F12: uploading the signed original bumps the DOCUMENT, and the shared
  // document detail query is the one the attachment manager invalidates. The
  // adjustment read is NOT refreshed, so posting its stale version answers 409.
  it('posts the document CURRENT rowVersion, not the adjustment read stale one (F12)', async () => {
    const staleAdjustment = {
      ...draftFixture({
        purpose: 'DirectCorrection',
        status: 'Draft',
        signedOriginalSatisfied: true,
      }),
      rowVersion: 1,
    }
    let postedBody: unknown
    server.use(
      http.post(`*/api/v1/adjustments/${ADJUSTMENT_ID}/post`, async ({ request }) => {
        postedBody = await request.json()
        return okJson({
          documentId: DOCUMENT_ID,
          status: 'Posted',
          postedAtUtc: '2026-08-26T09:00:00.000Z',
        })
      }),
    )
    useDetailHandlers({
      adjustment: staleAdjustment,
      documentStatus: 'Draft',
      signedOriginalSatisfied: true,
    })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'ترحيل السند' }))

    await waitFor(() => expect(postedBody).toEqual({ rowVersion: 2 }))
  })
})
