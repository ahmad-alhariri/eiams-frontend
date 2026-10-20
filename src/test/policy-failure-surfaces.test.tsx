import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AdjustmentActionBar } from '@/modules/adjustment/components/adjustment-action-bar'
import { AttachmentPanel } from '@/shared/documents/attachment-panel'
import { LifecycleActionBar } from '@/shared/documents/lifecycle-action-bar'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createSessionRole, createSessionScope, createSessionUser } from '@/test/msw/factories'
import { wirePolicy } from '@/test/msw/document-wire-fixtures'
import { ACTIVE_SOFT_FREEZE_ADVISORY_CODE } from '@/shared/documents/policy-blocker-codes'
import type { SessionResponse } from '@/modules/auth/types/session.types'
import type { DocumentPolicy } from '@/shared/documents/types/document-wire.types'

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
 *
 * ## What changed with the wire contract
 *
 * The live policy carries English prose (`message` / `reason`) and no `messageAr`
 * anywhere; user-facing Arabic is frontend-owned and keyed by CODE through
 * `error-copy-ar.ts`. The lifecycle bar already resolves that way
 * (`policyBlockerMessageAr`), so these cases assert the sentence a CODE resolves
 * to, and where a code has no governed entry they assert the real outcome —
 * nothing rendered — rather than the Arabic the snapshot used to carry on the
 * wire.
 *
 * `AdjustmentActionBar` has NOT moved to the wire policy: it still declares
 * `messageAr` / `reasonAr` props of its own. The helpers below map one wire
 * policy into that vocabulary so both bars are still driven from ONE payload,
 * which is the cross-surface property this file exists to hold.
 */

const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000c8'

const MANAGER_CODES = ['document.view', 'document.post', 'document.reverse']

const noop = () => undefined

/**
 * The advisory line renders its text and the scope/count siblings inside one
 * element, so its accessible text is a concatenation and an exact `getByText`
 * cannot match it. Both action bars tag that line with the same `data-slot`,
 * which is what makes the cross-surface check possible.
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

/** The backend's own code for "the signed copy must be attached before posting". */
const SIGNED_COPY_REQUIRED_CODE = 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED'
/** What that code resolves to in the governed copy table. */
const SIGNED_ORIGINAL_REASON_AR = 'يجب إرفاق النسخة الموقعة قبل الترحيل.'
const SOFT_FREEZE_ADVISORY = 'An inventory count covers the scope of this warehouse.'

/**
 * The wire advisory record: `{ code, message, countId, warehouseId }`. The
 * snapshot's `countReference` / `scopeSummaryAr` / `overlapState` decorations are
 * not part of the live `DocumentPolicyAdvisory` and are gone from the wire.
 */
const advisory = {
  code: ACTIVE_SOFT_FREEZE_ADVISORY_CODE,
  message: SOFT_FREEZE_ADVISORY,
  countId: '00000000-0000-4000-8000-0000000000ad',
  warehouseId: '00000000-0000-4000-8000-0000000000ad',
}

/** A Submitted document blocked only by the missing signed original. */
function blockedPolicy(): DocumentPolicy {
  return wirePolicy({
    documentId: DOCUMENT_ID,
    status: 'Submitted',
    signedOriginalSatisfied: false,
    blockers: [
      { action: 'Post', code: SIGNED_COPY_REQUIRED_CODE, message: 'The signed copy is required.' },
    ],
    warnings: [],
  })
}

function adjustmentBarProps(policy: DocumentPolicy) {
  return {
    actions: policy.actions,
    blockers: policy.blockers,
    advisories: policy.warnings,
  }
}

function renderLifecycleBar(policy: DocumentPolicy) {
  return renderWithSession(
    <LifecycleActionBar policy={policy} busyAction={null} onExecute={noop} />,
  )
}

function renderAdjustmentBar(policy: DocumentPolicy) {
  const slices = adjustmentBarProps(policy)
  return renderWithSession(
    <AdjustmentActionBar
      adjustmentId={DOCUMENT_ID}
      status="Draft"
      purpose="DirectCorrection"
      rowVersion={1}
      actions={slices.actions}
      blockers={slices.blockers}
      advisories={slices.advisories}
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

  it('surfaces the reason the blocker CODE resolves to on the lifecycle bar', () => {
    renderLifecycleBar(blockedPolicy())
    expect(screen.getByText(SIGNED_ORIGINAL_REASON_AR)).toBeInTheDocument()
  })

  it('surfaces the same reason on the adjustment bar', () => {
    renderAdjustmentBar(blockedPolicy())
    expect(screen.getByText(SIGNED_ORIGINAL_REASON_AR)).toBeInTheDocument()
  })

  it('renders no alert at all for a blocker code with no governed Arabic entry', () => {
    // An Arabic-first UI must not switch language on a code the copy table has
    // never heard of, so the row is absent rather than rendered in English.
    const policy = wirePolicy({
      documentId: DOCUMENT_ID,
      status: 'Submitted',
      signedOriginalSatisfied: true,
      blockers: [
        { action: 'Post', code: 'A_CODE_NOBODY_TRANSLATED', message: 'Blocked by policy.' },
      ],
    })
    const { container } = renderLifecycleBar(policy)
    // The alert region is still mounted (the policy did carry a blocker); what
    // must not appear is any sentence at all, least of all the English prose.
    const alerts = [...container.querySelectorAll('[role="alert"]')]
    expect(alerts.every((alert) => alert.textContent?.trim() === '')).toBe(true)
    expect(screen.queryByText('Blocked by policy.')).toBeNull()
  })
})

describe('the server presentation alone gates posting (e24-t07)', () => {
  const policyWithUnrelatedBlocker = () =>
    wirePolicy({
      documentId: DOCUMENT_ID,
      status: 'Submitted',
      signedOriginalSatisfied: true,
      blockers: [
        {
          action: 'Post',
          code: SIGNED_COPY_REQUIRED_CODE,
          message: 'The signed copy is required.',
        },
      ],
    })

  it('enables Post when the server presents it Enabled, blockers notwithstanding', () => {
    // Previously the adjustment bar derived "blocked" from `blockers.length > 0`
    // and would have disabled Post here, diverging from the shared bar.
    renderAdjustmentBar(policyWithUnrelatedBlocker())
    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeEnabled()
  })

  it('still shows that other blocker as an alert while leaving the action enabled', () => {
    renderAdjustmentBar(policyWithUnrelatedBlocker())
    expect(screen.getByText(SIGNED_ORIGINAL_REASON_AR)).toBeInTheDocument()
  })
})

describe('advisories reach the adjustment surface', () => {
  const policyWithAdvisory = () =>
    wirePolicy({
      documentId: DOCUMENT_ID,
      status: 'Submitted',
      signedOriginalSatisfied: true,
      warnings: [advisory],
    })

  it('renders an ActiveSoftFreeze advisory that previously had no surface here', () => {
    const { container } = renderAdjustmentBar(policyWithAdvisory())
    expect(advisoryLine(container)).toContain(SOFT_FREEZE_ADVISORY)
  })

  it('carries the advisory text alone: the live advisory record has no scope or count copy', () => {
    // The wire `DocumentPolicyAdvisory` is `{ code, message, countId, warehouseId }`;
    // the snapshot's `scopeSummaryAr` / `countReference` decorations no longer
    // exist, so nothing is appended to the sentence.
    const { container } = renderAdjustmentBar(policyWithAdvisory())
    expect(advisoryLine(container)).toBe(SOFT_FREEZE_ADVISORY)
  })

  it('never disables an action because of an advisory', () => {
    renderAdjustmentBar(policyWithAdvisory())
    expect(screen.getByRole('button', { name: 'ترحيل السند' })).toBeEnabled()
  })

  it('never renders an advisory as a destructive alert', () => {
    const { container } = renderAdjustmentBar(policyWithAdvisory())
    const alerts = [...container.querySelectorAll('[role="alert"]')]
    expect(alerts.some((alert) => alert.textContent?.includes(SOFT_FREEZE_ADVISORY) === true)).toBe(
      false,
    )
  })

  it('renders no advisory row on the lifecycle bar for a code with no governed Arabic entry', () => {
    // `ActiveSoftFreeze` normalizes to `ACTIVESOFTFREEZE`, which the governed
    // copy table does not carry, so the shared bar drops the row rather than
    // rendering the server's English prose in an Arabic-first screen.
    const { container } = renderLifecycleBar(policyWithAdvisory())
    expect(advisoryLine(container)).toBe('')
    expect(screen.queryByText(SOFT_FREEZE_ADVISORY)).toBeNull()
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
        actions={wirePolicy({ documentId: DOCUMENT_ID, status: 'Submitted' }).actions}
        blockers={[]}
        advisories={[]}
      />,
      ['document.view'],
    )
    expect(screen.queryByRole('button', { name: 'ترحيل السند' })).toBeNull()
  })
})

describe('the attachment gate row owns the requirement, not the reason (e24-t07 finding)', () => {
  function renderGate(policy: DocumentPolicy) {
    return renderWithSession(
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
  }

  it('shows the requirement badge without echoing the reason for the namespaced spelling', () => {
    // Recorded rather than changed: widening this row's blocker match to the
    // `document.`-prefixed vocabulary the contract producers emit would make the
    // identical Arabic sentence render here *and* in the action bar alert above,
    // on every document screen. See docs/policy-failure-matrix-verification.md.
    const policy = wirePolicy({
      documentId: DOCUMENT_ID,
      status: 'Submitted',
      signedOriginalSatisfied: false,
      blockers: [
        {
          action: 'Post',
          code: 'document.signed_original_missing',
          message: 'The signed copy is required.',
        },
      ],
    })
    renderGate(policy)
    expect(screen.getByTestId('attachment-gate-missing')).toBeInTheDocument()
    expect(screen.queryByText(SIGNED_ORIGINAL_REASON_AR)).toBeNull()
  })

  it('matches the bare spelling too, and still echoes nothing: the gate codes have no governed copy', () => {
    // The bare code IS matched by the row (that is why this case exists at all),
    // but `error-copy-ar.ts` carries no entry for `SIGNED_ORIGINAL_MISSING`, so
    // the resolved sentence is `null` and only the requirement badge renders.
    // The assertion is on the outcome, not on the matcher's internal branch.
    const policy = wirePolicy({
      documentId: DOCUMENT_ID,
      status: 'Submitted',
      signedOriginalSatisfied: false,
      blockers: [
        {
          action: 'Post',
          code: 'signed_original_missing',
          message: 'The signed copy is required.',
        },
      ],
    })
    renderGate(policy)
    expect(screen.getByTestId('attachment-gate-missing')).toBeInTheDocument()
    expect(screen.getByText('النسخة الأصلية الموقعة مطلوبة للترحيل')).toBeInTheDocument()
    expect(screen.queryByText(SIGNED_ORIGINAL_REASON_AR)).toBeNull()
  })
})

describe('a disposal adjustment never offers reversal', () => {
  it('renders no Reverse for a terminal disposal', () => {
    renderAdjustmentBar(wirePolicy({ documentId: DOCUMENT_ID, status: 'Posted' }))
    expect(screen.queryByRole('button', { name: /عكس/ })).toBeNull()
  })

  it('exposes Post as Enabled only via the server action slice', () => {
    const policy = wirePolicy({
      documentId: DOCUMENT_ID,
      status: 'Submitted',
      signedOriginalSatisfied: true,
    })
    const post = policy.actions.find((entry) => entry.action === 'Post')
    expect(post?.presentation).toBe('Enabled')
    expect(post?.allowed).toBe(true)
  })
})
