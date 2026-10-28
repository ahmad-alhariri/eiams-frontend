import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdjustmentActionBar } from '@/modules/adjustment/components/adjustment-action-bar'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import { apiJson, okJson } from '@/test/msw/envelope'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import type {
  DocumentActionAvailability,
  DocumentPolicyAdvisory,
  DocumentPolicyBlocker,
} from '@/shared/documents/types/document-wire.types'
import { createSessionUser, createSessionRole, createSessionScope } from '@/test/msw/factories'
import { toast } from '@/shared/ui/toast-manager'

vi.mock('@/shared/ui/toast-manager', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'مدير المستودع' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

const ADJUSTMENT_ID = '423e4567-e89b-42d3-a456-426614174004'
/** The compensating document the server creates when a posted adjustment is reversed. */
const REVERSAL_ID = '523e4567-e89b-42d3-a456-426614174005'

const ENABLED_POST: ReadonlyArray<DocumentActionAvailability> = [
  {
    action: 'Post',
    allowed: true,
    confirmationRequired: false,
    presentation: 'Enabled',
    reasonCode: null,
    reason: null,
    reasonRequired: false,
  },
]
const BLOCKED_POST: ReadonlyArray<DocumentActionAvailability> = [
  {
    action: 'Post',
    allowed: false,
    confirmationRequired: false,
    presentation: 'Disabled',
    reasonCode: 'document.signed_original_missing',
    reason: 'يلزم رفع النسخة الموقعة.',
    reasonRequired: false,
  },
]
const ENABLED_REVERSE: ReadonlyArray<DocumentActionAvailability> = [
  {
    action: 'Reverse',
    allowed: true,
    confirmationRequired: false,
    presentation: 'Enabled',
    reasonCode: null,
    reason: null,
    reasonRequired: true,
  },
]

let capturedPostBody: unknown = null

function usePostHandler() {
  capturedPostBody = null
  server.use(
    http.post(`*/api/v1/adjustments/${ADJUSTMENT_ID}/post`, async ({ request }) => {
      capturedPostBody = await request.json()
      // Wire shape the backend serves: the shared engine's post projection.
      return okJson({ documentId: ADJUSTMENT_ID, warnings: [] })
    }),
  )
}

/**
 * The reversal endpoint answers 201 with the compensating document's id only
 * (`ResourceIdResponse`), or the Arabic error envelope when it refuses.
 */
function useReverseHandler(options: { ok: boolean }) {
  server.use(
    http.post(`*/api/v1/adjustments/${ADJUSTMENT_ID}/reverse`, () =>
      options.ok
        ? apiJson({ id: REVERSAL_ID }, { status: 201 })
        : apiJson(
            { title: 'تعذّر عكس السند', detailAr: 'لا يمكن عكس السند في حالته الحالية.' },
            { status: 409 },
          ),
    ),
  )
}

/** Exposes the router location so a navigation can be observed. */
function CurrentPath() {
  const { pathname } = useLocation()
  return <span data-testid="current-path">{pathname}</span>
}

function Harness({
  status,
  purpose,
  actions,
  blockers = [],
  advisories = [],
  permissions = ['document.view', 'document.post', 'document.reverse'],
}: {
  status: 'Draft' | 'Posted' | 'Reversed'
  purpose: 'CountVariance' | 'DirectCorrection' | 'Disposal'
  actions: ReadonlyArray<DocumentActionAvailability>
  blockers?: ReadonlyArray<DocumentPolicyBlocker>
  advisories?: ReadonlyArray<DocumentPolicyAdvisory>
  permissions?: string[]
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(authSessionQueryKey, sessionWith(permissions))
  return (
    <MemoryRouter initialEntries={[`/adjustments/${ADJUSTMENT_ID}`]}>
      <QueryClientProvider client={client}>
        <CurrentPath />
        <AdjustmentActionBar
          adjustmentId={ADJUSTMENT_ID}
          status={status}
          purpose={purpose}
          rowVersion={7}
          actions={actions}
          blockers={blockers}
          advisories={advisories}
        />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  server.resetHandlers()
  vi.clearAllMocks()
})

describe('AdjustmentActionBar (e21-t06)', () => {
  it('hides Reverse without document.reverse despite create/post and an enabled server policy', () => {
    render(
      <Harness
        status="Posted"
        purpose="CountVariance"
        actions={ENABLED_REVERSE}
        permissions={['document.view', 'document.create', 'document.post']}
      />,
    )
    expect(screen.queryByRole('button', { name: 'عكس السند' })).not.toBeInTheDocument()
  })

  it('allows Reverse with its own permission without requiring create/post', () => {
    render(
      <Harness
        status="Posted"
        purpose="CountVariance"
        actions={ENABLED_REVERSE}
        permissions={['document.view', 'document.reverse']}
      />,
    )
    expect(screen.getByRole('button', { name: 'عكس السند' })).toBeEnabled()
  })
  it('renders Post for a manager on a clean Draft and posts idempotently', async () => {
    usePostHandler()
    const user = userEvent.setup()
    render(<Harness status="Draft" purpose="DirectCorrection" actions={ENABLED_POST} />)

    const btn = screen.getByRole('button', { name: 'ترحيل السند' })
    await user.click(btn)

    // The mutation resolves; assert the wire body carried the row version.
    await vi.waitFor(() => expect(capturedPostBody).toMatchObject({ rowVersion: 7 }))
  })

  it('disables Post and leaves the signed-original reason to the attachment gate row', () => {
    // eiams-frontend-n31q: the signed-original reason is stated ONCE per
    // screen, by the attachment gate row this bar is always mounted beside. The
    // bar therefore omits that blocker instead of printing the same Arabic
    // sentence twice.
    render(
      <Harness
        status="Draft"
        purpose="DirectCorrection"
        actions={BLOCKED_POST}
        blockers={[
          {
            action: 'Post',
            code: 'document.signed_original_missing',
            message: 'يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.',
          },
        ]}
      />,
    )

    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeDisabled()
    expect(screen.queryByText('يلزم رفع النسخة الأصلية الموقعة قبل الترحيل.')).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
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

  // F15: the reversal creates a COMPENSATING document, and that document is
  // the only place the reversal can be finished (upload its signed original,
  // then post it). Without a navigation it is unreachable from the UI.
  it('navigates to the compensating document after a successful reversal', async () => {
    useReverseHandler({ ok: true })
    const user = userEvent.setup()
    render(<Harness status="Posted" purpose="DirectCorrection" actions={ENABLED_REVERSE} />)

    await user.click(screen.getByRole('button', { name: 'عكس السند' }))
    await user.type(screen.getByLabelText('سبب العكس'), 'خطأ في الترحيل')
    await user.click(screen.getByRole('button', { name: 'تأكيد العكس' }))

    await waitFor(() =>
      expect(screen.getByTestId('current-path')).toHaveTextContent(`/adjustments/${REVERSAL_ID}`),
    )
    // The existing behaviour is unchanged: the success toast still fires.
    expect(toast.success).toHaveBeenCalled()
  })

  it('stays on the source document when the reversal fails', async () => {
    useReverseHandler({ ok: false })
    const user = userEvent.setup()
    render(<Harness status="Posted" purpose="DirectCorrection" actions={ENABLED_REVERSE} />)

    await user.click(screen.getByRole('button', { name: 'عكس السند' }))
    await user.type(screen.getByLabelText('سبب العكس'), 'خطأ في الترحيل')
    await user.click(screen.getByRole('button', { name: 'تأكيد العكس' }))

    // The failure is the settled signal that no navigation may have happened.
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByTestId('current-path')).toHaveTextContent(`/adjustments/${ADJUSTMENT_ID}`)
    expect(screen.getByTestId('current-path')).not.toHaveTextContent(REVERSAL_ID)
  })

  it('hides Post from a keeper despite document.create and an enabled policy', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(authSessionQueryKey, sessionWith(['document.view', 'document.create']))
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <AdjustmentActionBar
            adjustmentId={ADJUSTMENT_ID}
            status="Draft"
            purpose="DirectCorrection"
            rowVersion={1}
            actions={ENABLED_POST}
            blockers={[]}
            advisories={[]}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'ترحيل السند' })).toBeNull()
  })

  it('renders nothing once Reversed (terminal)', () => {
    render(<Harness status="Reversed" purpose="DirectCorrection" actions={[]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
