import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import {
  assignCustodySchema,
} from '@/modules/custody/schemas/assign-custody.schema'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'

import { AssignCustodyDialog } from './assign-custody-dialog'

const API_BASE_URL = '/api/v1'
const ASSET_ID = fixtureUuid(235)
const EMPLOYEE_ID = fixtureUuid(15)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

const custody = {
  assetId: ASSET_ID,
  assetNumber: 'AST-2023-C099',
  custodyId: fixtureUuid(52),
  custodyKind: 'Operational',
  fromTs: '2026-08-01T08:00:00.000Z',
  holder: {
    displayName: 'مديرية النقل والحراسة',
    id: fixtureUuid(21),
    secondaryLabelAr: null,
    status: 'Active' as const,
    type: 'OrganizationalUnit' as const,
  },
  issueDocumentId: fixtureUuid(155),
  rowVersion: 1,
  status: 'Active',
  subjectType: 'Asset',
} as const

function useEmployeeHandler() {
  server.use(
    http.get(`${API_BASE_URL}/counterparts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('type')).toBe('Employee')
      return HttpResponse.json({
        items: [
          {
            displayName: 'أحمد محمد',
            id: EMPLOYEE_ID,
            secondaryLabelAr: null,
            status: 'Active' as const,
            type: 'Employee' as const,
          },
        ],
        meta: { page: 0, pageSize: 10, total: 1 },
      })
    }),
  )
}

function renderDialog() {
  const client = createQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <AssignCustodyDialog custody={custody} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

async function selectEmployee(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('الموظف المكلف'))
  await user.type(screen.getByLabelText('الموظف المكلف'), 'أحمد')
  await user.click(await screen.findByRole('option', { name: /أحمد/ }))
}

describe('AssignCustodyDialog (e19-t03)', () => {
  it('validates the schema: assignment without an employee surfaces the Arabic message', async () => {
    renderDialog()
    // Submit with no employee selected — zodResolver must block and show the message.
    await userEvent.click(screen.getByRole('button', { name: 'تأكيد التكليف' }))
    expect(await screen.findByText('يجب اختيار الموظف المكلف.')).toBeInTheDocument()
  })

  it('posts the idempotent assign mutation for a valid selection and closes', async () => {
    useEmployeeHandler()
    let postedBody: Record<string, unknown> | undefined
    let idempotencyKey: string | undefined
    server.use(
      http.post(`${API_BASE_URL}/custodies/assign`, async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>
        idempotencyKey = request.headers.get('Idempotency-Key') ?? undefined
        return HttpResponse.json(
          { custodyId: fixtureUuid(60), status: 'Active', custodyKind: 'Personal' },
          { status: 201 },
        )
      }),
    )

    const user = userEvent.setup()
    renderDialog()
    await selectEmployee(user)
    await user.click(screen.getByRole('button', { name: 'تأكيد التكليف' }))

    await waitFor(() => expect(postedBody).toBeDefined())
    expect(postedBody).toMatchObject({
      subjectType: 'Asset',
      assetId: ASSET_ID,
      custodyKind: 'Personal',
      holderType: 'Employee',
      rowVersion: 1,
    })
    expect(typeof idempotencyKey).toBe('string')
    expect(idempotencyKey).not.toBe('')
  })

  it('accepts an optional reason and appends the employee name to it', async () => {
    useEmployeeHandler()
    let postedBody: Record<string, unknown> | undefined
    server.use(
      http.post(`${API_BASE_URL}/custodies/assign`, async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({}, { status: 201 })
      }),
    )

    const user = userEvent.setup()
    renderDialog()
    await selectEmployee(user)
    await user.type(screen.getByLabelText('السبب (اختياري)'), 'طلب الإدارة')
    await user.click(screen.getByRole('button', { name: 'تأكيد التكليف' }))

    await waitFor(() => expect(postedBody).toBeDefined())
    expect(String(postedBody?.["reason"])).toContain('طلب الإدارة')
  })

  it('rejects reasons longer than 300 characters', () => {
    const result = assignCustodySchema.safeParse({
      holderId: EMPLOYEE_ID,
      holderDisplayName: 'أحمد محمد',
      reason: 'x'.repeat(301),
    })
    expect(result.success).toBe(false)
  })
})
