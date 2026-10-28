import { QueryClientProvider } from '@tanstack/react-query'
import { apiJson, errJson, okPageJson } from '@/test/msw/envelope'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { TransferCustodyDialog } from './transfer-custody-dialog'
import type { Custody, CustodyKind } from '@/modules/custody/types/custody.types'
import type {
  CounterpartResolution,
  CounterpartType,
} from '@/modules/organization/types/counterpart-lookup.types'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

const API_BASE_URL = '/api/v1'
const CUSTODY_ID = fixtureUuid(52)
const ASSET_ID = fixtureUuid(235)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

/** The LIVE `GET /custodies` row the transfer is composed from. */
const custody: Custody = {
  subjectType: 'Asset',
  subjectId: ASSET_ID,
  custodyId: CUSTODY_ID,
  materialId: fixtureUuid(61),
  materialNameAr: 'حاسوب مكتبي',
  materialNameEn: null,
  materialCode: 'IT-HW-PC-001',
  materialKind: 'Asset',
  trackingType: 'Serial',
  serialNumber: 'SN-PC-0001',
  assetNumber: 'AST-2023-C099',
  warehouseId: fixtureUuid(30),
  warehouseName: 'المستودع المركزي',
  holderType: 'OrganizationalUnit',
  holderId: fixtureUuid(21),
  holderDisplayName: 'مديرية النقل والحراسة',
  custodyKind: 'Operational',
  issuedQuantity: 1,
  activeQuantity: 1,
  returnedQuantity: 0,
  issueDocumentId: fixtureUuid(155),
  systemReferenceNumber: 'ISSUE-2026-0001',
  status: 'Active',
  fromUtc: '2026-08-01T08:00:00.000Z',
  toUtc: null,
  rowVersion: 3,
}

/**
 * The holder kinds the live counterpart lookup serves for a transfer.
 *
 * Every kind was proved live on 2026-10-22 with a real transfer against the
 * MAIN warehouse: `GET /counterparts?operation=Transfer&type=<kind>` answers
 * the counterpart, and `POST /custodies/{id}/transfer` accepts the holder with
 * the kind the server pairs it with.
 */
const HOLDER_CASES = [
  {
    type: 'Employee' as CounterpartType,
    labelAr: 'موظف',
    id: fixtureUuid(15),
    displayName: 'محمد السيد',
    searchTerm: 'محمد',
    kind: 'Personal' as CustodyKind,
  },
  {
    type: 'OrganizationalUnit' as CounterpartType,
    labelAr: 'وحدة تنظيمية',
    id: fixtureUuid(21),
    displayName: 'مديرية النقل والحراسة',
    searchTerm: 'مديرية',
    kind: 'Operational' as CustodyKind,
  },
  {
    type: 'Site' as CounterpartType,
    labelAr: 'موقع',
    id: fixtureUuid(22),
    displayName: 'مقر دمشق',
    searchTerm: 'مقر',
    kind: 'Operational' as CustodyKind,
  },
  {
    type: 'External' as CounterpartType,
    labelAr: 'جهة خارجية',
    id: fixtureUuid(23),
    displayName: 'شركة النور للتجارة',
    searchTerm: 'شركة',
    kind: 'Operational' as CustodyKind,
  },
]

const EMPLOYEE: CounterpartResolution = {
  type: 'Employee',
  id: fixtureUuid(15),
  displayName: 'محمد السيد',
  secondaryLabelAr: null,
  status: 'Active',
}

/**
 * The typed search term has to be a substring of the served counterpart's name:
 * the selector renders the label the server returned for that query, so a term
 * that matches nothing cannot produce a selectable option.
 */
const EMPLOYEE_SEARCH_TERM = 'محمد'

/** The transfer lookup: `operation=Transfer` with the picked holder kind. */
function useTransferHandler(holderType: CounterpartType, counterpart: CounterpartResolution) {
  server.use(
    http.get(`${API_BASE_URL}/counterparts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('operation')).toBe('Transfer')
      expect(url.searchParams.get('type')).toBe(holderType)
      return okPageJson([counterpart], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
    }),
  )
}

/** The employee counterpart served for the employee transfer flow. */
function useEmployeeHandler() {
  useTransferHandler('Employee', EMPLOYEE)
}

function renderDialog() {
  const client = createQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <TransferCustodyDialog custody={custody} />
    </QueryClientProvider>,
  )
}

async function openDialogAndSelectEmployee(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'مبادلة المسؤولية' }))
  const employeeInput = screen.getByLabelText('الحائز الجديد')
  await user.click(employeeInput)
  await user.type(employeeInput, EMPLOYEE_SEARCH_TERM)
  await user.click(await screen.findByRole('option', { name: new RegExp(EMPLOYEE_SEARCH_TERM) }))
}

describe('TransferCustodyDialog', () => {
  it('offers every holder kind the live counterpart lookup serves for a transfer', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'مبادلة المسؤولية' }))
    await user.click(screen.getByLabelText('نوع الحائز الجديد'))

    for (const holderCase of HOLDER_CASES) {
      expect(await screen.findByRole('option', { name: holderCase.labelAr })).toBeInTheDocument()
    }
  })

  it.each(HOLDER_CASES)('posts the live transfer body for a $type holder', async (holderCase) => {
    const counterpart: CounterpartResolution = {
      type: holderCase.type,
      id: holderCase.id,
      displayName: holderCase.displayName,
      secondaryLabelAr: null,
      status: 'Active',
    }
    useTransferHandler(holderCase.type, counterpart)
    let postedBody: Record<string, unknown> | undefined
    let postedPath = ''
    server.use(
      http.post(`${API_BASE_URL}/custodies/${CUSTODY_ID}/transfer`, async ({ request }) => {
        postedPath = new URL(request.url).pathname
        postedBody = (await request.json()) as Record<string, unknown>
        return apiJson({}, { status: 200 })
      }),
    )

    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'مبادلة المسؤولية' }))
    if (holderCase.type !== 'Employee') {
      await user.click(screen.getByLabelText('نوع الحائز الجديد'))
      await user.click(await screen.findByRole('option', { name: holderCase.labelAr }))
    }
    const holderInput = screen.getByLabelText('الحائز الجديد')
    await user.click(holderInput)
    await user.type(holderInput, holderCase.searchTerm)
    await user.click(await screen.findByRole('option', { name: new RegExp(holderCase.searchTerm) }))
    await user.click(screen.getByRole('button', { name: 'تأكيد المبادلة' }))

    await waitFor(() => expect(postedBody).toBeDefined())
    expect(postedPath).toBe(`/api/v1/custodies/${CUSTODY_ID}/transfer`)
    // Live wire: { subjectType, newHolderType, newHolderId, newCustodyKind,
    // expectedRowVersion, note? } — and nothing else, so the body is asserted
    // EXACTLY: a snapshot-era field name cannot slip back in.
    //
    // `newCustodyKind` follows the HOLDER: a Personal custody for an
    // Employee, an Operational one for an OrganizationalUnit, a Site or an
    // External party. The domain pairs the two (`Domain/Custodies/Custody.cs`),
    // and the server refuses a mismatched pair with 400
    // COUNTERPARTS_OPERATIONAL_REQUIRES_NON_EMPLOYEE.
    expect(postedBody).toEqual({
      subjectType: 'Asset',
      newHolderType: holderCase.type,
      newHolderId: holderCase.id,
      newCustodyKind: holderCase.kind,
      expectedRowVersion: 3,
      note: `مبادلة مسؤولية إلى ${holderCase.displayName}`,
    })
  })

  it('drops a holder captured under another kind', async () => {
    // A holder id captured for one kind must never travel under another: the
    // server resolves the pair it is given, so an Employee id sent as a Site
    // holder is a mismatch the server answers 404 COUNTERPARTS_NOT_FOUND for.
    useTransferHandler('Employee', EMPLOYEE)
    let postedBody: Record<string, unknown> | undefined
    server.use(
      http.post(`${API_BASE_URL}/custodies/${CUSTODY_ID}/transfer`, async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>
        return apiJson({}, { status: 200 })
      }),
    )

    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'مبادلة المسؤولية' }))
    const holderInput = screen.getByLabelText('الحائز الجديد')
    await user.click(holderInput)
    await user.type(holderInput, EMPLOYEE_SEARCH_TERM)
    await user.click(await screen.findByRole('option', { name: new RegExp(EMPLOYEE_SEARCH_TERM) }))

    // Switching the kind clears the employee selection: it means nothing for a
    // Site holder, so nothing may be posted until a Site holder is picked.
    await user.click(screen.getByLabelText('نوع الحائز الجديد'))
    await user.click(await screen.findByRole('option', { name: 'موقع' }))
    expect(screen.getByLabelText('الحائز الجديد')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'تأكيد المبادلة' }))
    expect(await screen.findByText('يجب اختيار الحائز الجديد.')).toBeInTheDocument()
    expect(postedBody).toBeUndefined()
  })

  it('presents a 404 as "not found", never as "unauthorized"', async () => {
    // The live transfer endpoint answers 404 (not 403) for a custody outside
    // the caller's scope, so the operator must be told the row is not there —
    // not that they lack a permission they may well hold.
    useEmployeeHandler()
    server.use(
      http.post(`${API_BASE_URL}/custodies/${CUSTODY_ID}/transfer`, () =>
        errJson(404, { code: 'Custodies.NotFound' }),
      ),
    )

    const user = userEvent.setup()
    renderDialog()
    await openDialogAndSelectEmployee(user)
    await user.click(screen.getByRole('button', { name: 'تأكيد المبادلة' }))

    expect(await screen.findByText('لم يتم العثور على العهدة.')).toBeInTheDocument()
    expect(screen.queryByText(/لا تملك الصلاحية/)).toBeNull()
  })

  it('explains a refused holder instead of the generic 400 wording', async () => {
    // The server refuses a holder/kind pair it does not accept with
    // COUNTERPARTS_OPERATIONAL_REQUIRES_NON_EMPLOYEE. Unmapped, that 400 fell
    // back to the generic "check the entered data", which told the operator
    // nothing about the pair the server had actually rejected.
    useEmployeeHandler()
    server.use(
      http.post(`${API_BASE_URL}/custodies/${CUSTODY_ID}/transfer`, () =>
        errJson(400, { code: 'Counterparts.OperationalRequiresNonEmployee' }),
      ),
    )

    const user = userEvent.setup()
    renderDialog()
    await openDialogAndSelectEmployee(user)
    await user.click(screen.getByRole('button', { name: 'تأكيد المبادلة' }))

    expect(
      await screen.findByText(
        'العهدة التشغيلية تتطلب جهة من نوع وحدة تنظيمية أو موقع أو جهة خارجية.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('تعذر تنفيذ الطلب. راجع البيانات المدخلة.')).toBeNull()
  })
})
