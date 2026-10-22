import { QueryClientProvider } from '@tanstack/react-query'
import { apiJson, errJson, okPageJson } from '@/test/msw/envelope'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { TransferCustodyDialog } from './transfer-custody-dialog'
import type { Custody } from '@/modules/custody/types/custody.types'
import type { CounterpartResolution } from '@/modules/organization/types/counterpart-lookup.types'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

const API_BASE_URL = '/api/v1'
const CUSTODY_ID = fixtureUuid(52)
const ASSET_ID = fixtureUuid(235)
const EMPLOYEE_ID = fixtureUuid(15)

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

const EMPLOYEE: CounterpartResolution = {
  type: 'Employee',
  id: EMPLOYEE_ID,
  displayName: 'محمد السيد',
  secondaryLabelAr: null,
  status: 'Active',
}

/**
 * The typed search term has to be a substring of the served employee's name:
 * the selector renders the label the server returned for that query, so a term
 * that matches nothing cannot produce a selectable option.
 */
const EMPLOYEE_SEARCH_TERM = 'محمد'

function useEmployeeHandler() {
  server.use(
    http.get(`${API_BASE_URL}/counterparts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('operation')).toBe('Issue')
      expect(url.searchParams.get('type')).toBe('Employee')
      return okPageJson([EMPLOYEE], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
    }),
  )
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
  const employeeInput = screen.getByLabelText('الموظف المكلف')
  await user.click(employeeInput)
  await user.type(employeeInput, EMPLOYEE_SEARCH_TERM)
  await user.click(await screen.findByRole('option', { name: new RegExp(EMPLOYEE_SEARCH_TERM) }))
}

describe('TransferCustodyDialog', () => {
  it('posts the live transfer body to the per-custody path', async () => {
    useEmployeeHandler()
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
    await openDialogAndSelectEmployee(user)
    await user.click(screen.getByRole('button', { name: 'تأكيد المبادلة' }))

    await waitFor(() => expect(postedBody).toBeDefined())
    expect(postedPath).toBe(`/api/v1/custodies/${CUSTODY_ID}/transfer`)
    // Live wire: { subjectType, newHolderType, newHolderId, newCustodyKind,
    // expectedRowVersion, note? } — and nothing else, so the body is asserted
    // EXACTLY: a snapshot-era field name cannot slip back in.
    //
    // `newCustodyKind` is 'Personal' because the holder is an Employee: the
    // domain pairs the two (`Domain/Custodies/Custody.cs`), and the server
    // refuses an Employee holding an Operational custody with 400
    // COUNTERPARTS_OPERATIONAL_REQUIRES_NON_EMPLOYEE.
    expect(postedBody).toEqual({
      subjectType: 'Asset',
      newHolderType: 'Employee',
      newHolderId: EMPLOYEE_ID,
      newCustodyKind: 'Personal',
      expectedRowVersion: 3,
      note: 'مبادلة مسؤولية إلى محمد السيد',
    })
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
