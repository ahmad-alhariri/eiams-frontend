import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdjustmentActionBar } from './adjustment-action-bar'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

vi.mock('@/shared/ui/toast-manager', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'adjustment.manager',
      displayName: 'مدير المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [
      { scopeType: 'Enterprise', scopeId: null, displayName: 'الهيئة العامة للرقابة والتفتيش' },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

const ADJUSTMENT_ID = '423e4567-e89b-42d3-a456-426614174004'

const ENABLED_POST = [
  {
    action: 'Post',
    allowed: true,
    presentation: 'Enabled' as const,
    reasonAr: null,
    reasonRequired: false,
  },
]
const BLOCKED_POST = [
  {
    action: 'Post',
    allowed: false,
    presentation: 'Disabled' as const,
    reasonAr: 'يلزم رفع النسخة الموقعة.',
    reasonRequired: false,
  },
]
const ENABLED_REVERSE = [
  {
    action: 'Reverse',
    allowed: true,
    presentation: 'Enabled' as const,
    reasonAr: null,
    reasonRequired: true,
  },
]

let capturedPostBody: unknown = null
let postResponseStatus = 200

function usePostHandler() {
  capturedPostBody = null
  postResponseStatus = 200
  server.use(
    http.post(`*/api/v1/adjustments/${ADJUSTMENT_ID}/post`, async ({ request }) => {
      capturedPostBody = await request.json()
      return HttpResponse.json(
        {
          adjustment: { adjustmentId: ADJUSTMENT_ID, status: 'Posted' },
          assetMovements: [],
          lifecycleEvent: { eventId: 'evt-1' },
          stockMovements: [],
        },
        { status: postResponseStatus },
      )
    }),
  )
}

function Harness({
  status,
  purpose,
  actions,
  blockers = [],
}: {
  status: 'Draft' | 'Posted' | 'Reversed'
  purpose: 'CountVariance' | 'DirectCorrection' | 'Disposal'
  actions: ReadonlyArray<{
    action: string
    allowed: boolean
    presentation: 'Enabled' | 'Disabled' | 'Hidden'
    reasonAr?: string | null
    reasonRequired?: boolean
  }>
  blockers?: ReadonlyArray<{ code: string; messageAr: string }>
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(authSessionQueryKey, sessionWith(['document.view', 'document.create']))
  return (
    <QueryClientProvider client={client}>
      <AdjustmentActionBar
        adjustmentId={ADJUSTMENT_ID}
        status={status}
        purpose={purpose}
        rowVersion={7}
        actions={actions}
        blockers={blockers}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  server.resetHandlers()
})

describe('AdjustmentActionBar (e21-t06)', () => {
  it('renders Post for a manager on a clean Draft and posts idempotently', async () => {
    usePostHandler()
    const user = userEvent.setup()
    render(<Harness status="Draft" purpose="DirectCorrection" actions={ENABLED_POST} />)

    const btn = screen.getByRole('button', { name: 'ترحيل السند' })
    await user.click(btn)

    // The mutation resolves; assert the wire body carried the row version.
    await vi.waitFor(() => expect(capturedPostBody).toMatchObject({ rowVersion: 7 }))
  })

  it('disables Post with the server blocker message when SignedOriginal is unmet', () => {
    render(
      <Harness
        status="Draft"
        purpose="DirectCorrection"
        actions={BLOCKED_POST}
        blockers={[
          {
            code: 'SignedOriginalRequired',
            messageAr: 'يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.',
          },
        ]}
      />,
    )

    expect(screen.getByText('يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeDisabled()
  })

  it('never renders Post for a Posted adjustment or Reverse for a disposal', () => {
    render(<Harness status="Posted" purpose="Disposal" actions={[]} />)

    expect(screen.queryByRole('button', { name: 'ترحيل السند' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'عكس السند' })).toBeNull()
  })

  it('requires a documented reason before confirming reversal', async () => {
    usePostHandler()
    const user = userEvent.setup()
    render(<Harness status="Posted" purpose="DirectCorrection" actions={ENABLED_REVERSE} />)

    await user.click(screen.getByRole('button', { name: 'عكس السند' }))
    const confirm = screen.getByRole('button', { name: 'تأكيد العكس' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText('سبب العكس'), 'خطأ في الترحيل')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(await screen.findByRole('button', { name: 'عكس السند' })).toBeInTheDocument()
  })

  it('renders nothing for a keeper (no document.create)', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(authSessionQueryKey, sessionWith(['document.view']))
    render(
      <QueryClientProvider client={client}>
        <AdjustmentActionBar
          adjustmentId={ADJUSTMENT_ID}
          status="Draft"
          purpose="DirectCorrection"
          rowVersion={1}
          actions={ENABLED_POST}
          blockers={[]}
        />
      </QueryClientProvider>,
    )

    expect(screen.queryByRole('button', { name: 'ترحيل السند' })).toBeNull()
  })

  it('renders nothing once Reversed (terminal)', () => {
    render(<Harness status="Reversed" purpose="DirectCorrection" actions={[]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
