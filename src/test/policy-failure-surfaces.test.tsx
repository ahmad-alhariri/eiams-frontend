import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AdjustmentActionBar } from '@/modules/adjustment/components/adjustment-action-bar'
import { AttachmentPanel } from '@/shared/documents/attachment-panel'
import { LifecycleActionBar } from '@/shared/documents/lifecycle-action-bar'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import {
  createActionAvailability,
  createDocumentPolicy,
  createSessionRole,
  createSessionScope,
  createSessionUser,
} from '@/test/msw/factories'
import { ACTIVE_SOFT_FREEZE_ADVISORY_CODE } from '@/shared/documents/policy-blocker-codes'
import type { SessionResponse } from '@/modules/auth/types/session.types'

/**
 * Cross-surface policy-failure presentation (e24-t07).
 *
 * The same server policy reaches three surfaces: the shared lifecycle action
 * bar, the adjustment action bar, and the attachment gate row. Before this slice
 * the two action bars disagreed about the same payload — one disabled Post
 * whenever *any* blocker was present while the other consulted only the server's
 * own presentation — and the adjustment bar accepted no advisories at all, so
 * the only advisory code in the v1 contract silently vanished on that surface.
 *
 * These cases pin the shared contract so the two bars cannot drift again.
 */

const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000c8'

const MANAGER_CODES = ['document.view', 'document.post', 'document.reverse']

const noop = () => undefined

/**
 * The advisory line renders `messageAr`, the scope and the count reference as
 * siblings inside one element, so its accessible text is a concatenation and an
 * exact `getByText` cannot match it. Both action bars tag that line with the
 * same `data-slot`, which is what makes the cross-surface check possible.
 */
function advisoryLine(container: HTMLElement): string {
  return [...container.querySelectorAll('[data-slot="policy-advisory-row"]')]
    .map((node) => node.textContent ?? '')
    .join(' | ')
}

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: createSessionUser({ firstName: 'أمين المستودع' }),
    role: createSessionRole(),
    activeScope: createSessionScope(),
    permissionCodes: [...permissionCodes],
  }
}

function renderWithSession(ui: React.ReactNode, codes: readonly string[] = MANAGER_CODES) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(codes))
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const SIGNED_ORIGINAL_REASON = 'يجب إرفاق النسخة الموقعة من المستند قبل الرصد.'
const SOFT_FREEZE_ADVISORY = 'هناك جرد نشط يغطي نطاق هذا المستودع.'

const advisory = {
  code: ACTIVE_SOFT_FREEZE_ADVISORY_CODE,
  severity: 'Warning' as const,
  messageAr: SOFT_FREEZE_ADVISORY,
  countId: '00000000-0000-4000-8000-0000000000ad',
  countReference: 'JRY-2026-014',
  overlapState: 'Provisional' as const,
  scopeSummaryAr: 'مستودع دمشق المركزي',
  warehouseId: '00000000-0000-4000-8000-0000000000w1',
}

/** A Submitted document blocked only by the missing signed original. */
function blockedPolicy() {
  return createDocumentPolicy({
    documentId: DOCUMENT_ID,
    documentStatus: 'Submitted',
    signedOriginalSatisfied: false,
    advisories: [],
  })
}

function renderLifecycleBar(policy: ReturnType<typeof blockedPolicy>) {
  return renderWithSession(
    <LifecycleActionBar policy={policy} busyAction={null} onExecute={noop} />,
  )
}

function renderAdjustmentBar(policy: ReturnType<typeof blockedPolicy>) {
  return renderWithSession(
    <AdjustmentActionBar
      adjustmentId={DOCUMENT_ID}
      status="Draft"
      purpose="DirectCorrection"
      rowVersion={1}
      actions={policy.actions}
      blockers={policy.blockers}
      advisories={policy.advisories}
    />,
  )
}

describe('a server block is a hard stop on both action bars', () => {
  it('disables Post through the server presentation on the lifecycle bar', () => {
    renderLifecycleBar(blockedPolicy())
    expect(screen.getByRole('button', { name: 'ترحيل' })).toBeDisabled()
  })

  it('disables Post on the adjustment bar for the same reason', () => {
    renderAdjustmentBar(blockedPolicy())
    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeDisabled()
  })

  it('surfaces the server reason as an alert on the lifecycle bar', () => {
    renderLifecycleBar(blockedPolicy())
    expect(screen.getByText(SIGNED_ORIGINAL_REASON)).toBeInTheDocument()
  })

  it('surfaces the server reason as an alert on the adjustment bar', () => {
    renderAdjustmentBar(blockedPolicy())
    expect(screen.getByText(SIGNED_ORIGINAL_REASON)).toBeInTheDocument()
  })
})

describe('the server presentation alone gates posting (e24-t07)', () => {
  it('enables Post when the server presents it Enabled, blockers notwithstanding', () => {
    // Previously the adjustment bar derived "blocked" from `blockers.length > 0`
    // and would have disabled Post here, diverging from the shared bar.
    const policy = createDocumentPolicy({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      signedOriginalSatisfied: true,
      blockers: [
        {
          code: 'some_other_business_policy',
          field: null,
          messageAr: 'سبب آخر من الخادم.',
        },
      ],
    })
    renderAdjustmentBar(policy)
    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeEnabled()
  })

  it('still shows that other blocker as an alert while leaving the action enabled', () => {
    const policy = createDocumentPolicy({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      signedOriginalSatisfied: true,
      blockers: [
        {
          code: 'some_other_business_policy',
          field: null,
          messageAr: 'سبب آخر من الخادم.',
        },
      ],
    })
    renderAdjustmentBar(policy)
    expect(screen.getByText('سبب آخر من الخادم.')).toBeInTheDocument()
  })
})

describe('advisories reach the adjustment surface', () => {
  it('renders an ActiveSoftFreeze advisory that previously had no surface here', () => {
    const policy = createDocumentPolicy({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      signedOriginalSatisfied: true,
      advisories: [advisory],
    })
    const { container } = renderAdjustmentBar(policy)
    expect(advisoryLine(container)).toContain(SOFT_FREEZE_ADVISORY)
  })

  it('includes the scope and count reference alongside the advisory text', () => {
    const policy = createDocumentPolicy({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      signedOriginalSatisfied: true,
      advisories: [advisory],
    })
    renderAdjustmentBar(policy)
    expect(screen.getByText(/مستودع دمشق المركزي/)).toBeInTheDocument()
    expect(screen.getByText(/JRY-2026-014/)).toBeInTheDocument()
  })

  it('never disables an action because of an advisory', () => {
    const policy = createDocumentPolicy({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      signedOriginalSatisfied: true,
      advisories: [advisory],
    })
    renderAdjustmentBar(policy)
    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeEnabled()
  })

  it('never renders an advisory as a destructive alert', () => {
    const policy = createDocumentPolicy({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      signedOriginalSatisfied: true,
      advisories: [advisory],
    })
    const { container } = renderAdjustmentBar(policy)
    const alerts = [...container.querySelectorAll('[role="alert"]')]
    expect(alerts.some((alert) => alert.textContent?.includes(SOFT_FREEZE_ADVISORY) === true)).toBe(
      false,
    )
  })

  it('renders the same advisory on the lifecycle bar', () => {
    const policy = createDocumentPolicy({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      signedOriginalSatisfied: true,
      advisories: [advisory],
    })
    const { container } = renderLifecycleBar(policy)
    expect(advisoryLine(container)).toContain(SOFT_FREEZE_ADVISORY)
  })
})

describe('permission denial hides rather than disables', () => {
  it('hides Post entirely on the lifecycle bar when the session may not post', () => {
    // The shared bar is permission-agnostic by design: the page composes the
    // session decision and passes it down, so that is what is exercised here.
    renderWithSession(
      <LifecycleActionBar
        policy={blockedPolicy()}
        busyAction={null}
        onExecute={noop}
        isActionPermitted={() => false}
      />,
      ['document.view'],
    )
    expect(screen.queryByRole('button', { name: 'ترحيل' })).toBeNull()
  })

  it('hides Post entirely on the adjustment bar without document.post', () => {
    renderWithSession(
      <AdjustmentActionBar
        adjustmentId={DOCUMENT_ID}
        status="Draft"
        purpose="DirectCorrection"
        rowVersion={1}
        actions={
          createDocumentPolicy({ documentId: DOCUMENT_ID, documentStatus: 'Submitted' }).actions
        }
        blockers={[]}
        advisories={[]}
      />,
      ['document.view'],
    )
    expect(screen.queryByRole('button', { name: 'ترحيل السند' })).toBeNull()
  })
})

describe('the attachment gate row owns the requirement, not the reason (e24-t07 finding)', () => {
  it('shows the requirement badge without echoing the server reason', () => {
    // Recorded rather than changed: widening this row's blocker match to the
    // `document.`-prefixed vocabulary the contract producers emit would make the
    // identical Arabic sentence render here *and* in the action bar alert above,
    // on every document screen. See docs/policy-failure-matrix-verification.md.
    const policy = blockedPolicy()
    renderWithSession(
      <AttachmentPanel
        attachments={[]}
        pendingUploads={[]}
        onUpload={() => undefined}
        onRemove={() => undefined}
        onCancelPending={() => undefined}
        isUploading={false}
        policy={{
          signedOriginalSatisfied: policy.signedOriginalSatisfied,
          blockers: policy.blockers,
        }}
        documentStatus="Submitted"
      />,
    )
    expect(screen.getByTestId('attachment-gate-missing')).toBeInTheDocument()
    expect(screen.queryByText(SIGNED_ORIGINAL_REASON)).toBeNull()
  })

  it('still echoes the reason when the policy uses the bare code spelling', () => {
    const policy = createDocumentPolicy({
      documentId: DOCUMENT_ID,
      documentStatus: 'Submitted',
      signedOriginalSatisfied: false,
      blockers: [
        {
          code: 'signed_original_missing',
          field: null,
          messageAr: SIGNED_ORIGINAL_REASON,
        },
      ],
    })
    renderWithSession(
      <AttachmentPanel
        attachments={[]}
        pendingUploads={[]}
        onUpload={() => undefined}
        onRemove={() => undefined}
        onCancelPending={() => undefined}
        isUploading={false}
        policy={{ signedOriginalSatisfied: false, blockers: policy.blockers }}
        documentStatus="Submitted"
      />,
    )
    expect(screen.getByTestId('attachment-gate-missing')).toBeInTheDocument()
    expect(screen.getByText(SIGNED_ORIGINAL_REASON)).toBeInTheDocument()
  })
})

describe('a disposal adjustment never offers reversal', () => {
  it('renders no Reverse for a terminal disposal', () => {
    const policy = createDocumentPolicy({ documentId: DOCUMENT_ID, documentStatus: 'Posted' })
    renderAdjustmentBar(policy)
    expect(screen.queryByRole('button', { name: /عكس/ })).toBeNull()
  })

  it('exposes Post as Enabled only via the server action slice', () => {
    const availability = createActionAvailability('Post', { presentation: 'Enabled' })
    expect(availability.allowed).toBe(true)
  })
})
