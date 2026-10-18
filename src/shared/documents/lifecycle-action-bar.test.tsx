import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  LifecycleActionBar,
  type LifecycleActionBarProps,
} from '@/shared/documents/lifecycle-action-bar'
import type { DocumentActionType } from '@/shared/documents/types/document-action.types'
import type {
  DocumentActionAvailability,
  DocumentPolicy,
} from '@/shared/documents/types/document-wire.types'

/**
 * What changed with the wire contract
 * ----------------------------------
 * - `DocumentActionAvailability` answers `reason`, not `reasonAr`, and carries a
 *   `reasonCode`. The bar resolves its tooltip from the CODE through the governed
 *   `error-copy-ar.ts` table; the English `reason` is never rendered.
 * - `DocumentPolicy` answers `status` / `evaluatedAtUtc` / `warnings` and has no
 *   `policyKind`; the same rule applies to blocker and advisory copy.
 * - `DocumentActionType` is the closed nine-value vocabulary in
 *   `document-action.types.ts`, so an action code outside it is DROPPED rather
 *   than rendered under a generic label.
 */

function availability(
  overrides: Partial<DocumentActionAvailability> = {},
): DocumentActionAvailability {
  return {
    action: 'Submit',
    allowed: true,
    confirmationRequired: false,
    presentation: 'Enabled',
    reason: null,
    reasonCode: null,
    reasonRequired: false,
    ...overrides,
  }
}

function makePolicy(
  actions: DocumentActionAvailability[],
  overrides: Partial<DocumentPolicy> = {},
): DocumentPolicy {
  return {
    documentId: 'doc-1',
    status: 'Draft',
    evaluatedAtUtc: '2026-08-11T08:00:00Z',
    rowVersion: 1,
    signedOriginalSatisfied: true,
    actions,
    warnings: [],
    blockers: [],
    ...overrides,
  }
}

/** The backend's own code for "the signed copy must be attached before posting". */
const SIGNED_COPY_REQUIRED_CODE = 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED'
/** What that code resolves to in the governed copy table. */
const SIGNED_COPY_REQUIRED_AR = 'يجب إرفاق النسخة الموقعة قبل الترحيل.'

function renderBar(overrides: Partial<LifecycleActionBarProps> = {}) {
  const onExecute = overrides.onExecute ?? vi.fn()
  const props: LifecycleActionBarProps = {
    policy: makePolicy([availability({ action: 'Submit', confirmationRequired: true })]),
    busyAction: null,
    onExecute,
    ...overrides,
  }
  render(<LifecycleActionBar {...props} />)
  return { onExecute, user: userEvent.setup() }
}

describe('LifecycleActionBar', () => {
  it('renders enabled actions with their Arabic labels', () => {
    renderBar({
      policy: makePolicy([
        availability({ action: 'Submit', confirmationRequired: true }),
        availability({ action: 'Post', confirmationRequired: true }),
      ]),
    })

    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'ترحيل' })).toBeEnabled()
  })

  it('never renders Hidden actions', () => {
    renderBar({
      policy: makePolicy([
        availability({ action: 'Reverse', allowed: false, presentation: 'Hidden' }),
        availability({ action: 'Submit', confirmationRequired: true }),
      ]),
    })

    expect(screen.queryByRole('button', { name: 'عكس' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeInTheDocument()
  })

  it('renders Disabled actions disabled with the Arabic their reason CODE resolves to', () => {
    renderBar({
      policy: makePolicy([
        availability({
          action: 'Post',
          allowed: false,
          presentation: 'Disabled',
          reason: 'Insufficient quantity to cover the issue lines.',
          reasonCode: SIGNED_COPY_REQUIRED_CODE,
        }),
      ]),
    })

    const postButton = screen.getByRole('button', { name: 'ترحيل' })
    expect(postButton).toBeDisabled()
    expect(postButton).toHaveAttribute('title', SIGNED_COPY_REQUIRED_AR)
  })

  it('leaves the tooltip off entirely when the reason code has no governed Arabic entry', () => {
    renderBar({
      policy: makePolicy([
        availability({
          action: 'Post',
          allowed: false,
          presentation: 'Disabled',
          reason: 'Insufficient quantity to cover the issue lines.',
          reasonCode: 'A_CODE_NOBODY_TRANSLATED',
        }),
      ]),
    })

    const postButton = screen.getByRole('button', { name: 'ترحيل' })
    expect(postButton).toBeDisabled()
    // Never the server's English prose: an Arabic-first UI must not switch
    // language just because a code is unfamiliar.
    expect(postButton).not.toHaveAttribute('title')
  })

  it('opens the confirmation dialog on click and executes on confirm', async () => {
    const { onExecute, user } = renderBar({
      policy: makePolicy([availability({ action: 'Post', confirmationRequired: true })]),
    })

    await user.click(screen.getByRole('button', { name: 'ترحيل' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    expect(dialog).toHaveAccessibleDescription('هل تريد تنفيذ «ترحيل»؟')

    await user.click(within(dialog).getByRole('button', { name: 'ترحيل' }))

    await waitFor(() => expect(onExecute).toHaveBeenCalledWith('Post', undefined))
  })

  it('requires a reason and passes it to onExecute when reasonRequired', async () => {
    const { onExecute, user } = renderBar({
      policy: makePolicy([
        availability({
          action: 'Reject',
          confirmationRequired: true,
          reasonRequired: true,
        }),
      ]),
    })

    await user.click(screen.getByRole('button', { name: 'رفض' }))
    const dialog = await screen.findByRole('alertdialog')

    await user.type(within(dialog).getByLabelText('سبب الإجراء'), 'بنود غير مطابقة للفاتورة')
    await user.click(within(dialog).getByRole('button', { name: 'رفض' }))

    await waitFor(() =>
      expect(onExecute).toHaveBeenCalledWith('Reject', 'بنود غير مطابقة للفاتورة'),
    )
  })

  it('executes without a dialog when confirmation is not required', async () => {
    const { onExecute, user } = renderBar({
      policy: makePolicy([availability({ action: 'Submit', confirmationRequired: false })]),
    })

    await user.click(screen.getByRole('button', { name: 'إرسال للترحيل' }))

    expect(onExecute).toHaveBeenCalledWith('Submit', undefined)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('disables every button and marks the executing one busy while busyAction is set', async () => {
    renderBar({
      policy: makePolicy([
        availability({ action: 'Submit', confirmationRequired: true }),
        availability({ action: 'Cancel', confirmationRequired: true, reasonRequired: true }),
      ]),
      busyAction: 'Submit',
    })

    const busyButton = screen.getByRole('button', { name: 'جارٍ التنفيذ...' })
    expect(busyButton).toBeDisabled()
    expect(busyButton).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled()
  })

  it('combines the parent disabled gate with the policy presentation', () => {
    renderBar({
      policy: makePolicy([availability({ action: 'Submit', confirmationRequired: true })]),
      disabled: true,
    })

    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeDisabled()
  })

  it('renders blockers as an Arabic alert row', () => {
    renderBar({
      policy: makePolicy([availability({ action: 'Submit', confirmationRequired: true })], {
        blockers: [
          {
            action: 'Post',
            code: SIGNED_COPY_REQUIRED_CODE,
            message: 'The signed copy of the document is required before posting.',
          },
        ],
      }),
    })

    const alertRow = screen.getByRole('alert')
    expect(alertRow).toHaveTextContent(SIGNED_COPY_REQUIRED_AR)
    expect(alertRow.querySelector('[data-slot="policy-blocker-icon"]')).not.toBeNull()
    // The server's English prose is never surfaced.
    expect(alertRow).not.toHaveTextContent('The signed copy of the document is required')
  })

  it('renders an advisory as a muted info row when its code resolves to Arabic', () => {
    renderBar({
      policy: makePolicy([availability({ action: 'Submit', confirmationRequired: true })], {
        warnings: [
          {
            code: SIGNED_COPY_REQUIRED_CODE,
            message: 'An inventory count covers the scope of this warehouse.',
            countId: 'count-1',
            warehouseId: 'wh-1',
          },
        ],
      }),
    })

    const advisoryRow = screen.getByText(SIGNED_COPY_REQUIRED_AR)
    expect(advisoryRow).toBeInTheDocument()
    expect(
      advisoryRow.parentElement?.querySelector('[data-slot="policy-advisory-icon"]'),
    ).not.toBeNull()
  })

  it('renders no advisory row for a code the governed copy table has never heard of', () => {
    // `ActiveSoftFreeze` normalizes to `ACTIVESOFTFREEZE`, which carries no
    // Arabic entry, so the muted info row is dropped rather than rendered in
    // English.
    renderBar({
      policy: makePolicy([availability({ action: 'Submit', confirmationRequired: true })], {
        warnings: [
          {
            code: 'ActiveSoftFreeze',
            message: 'An inventory count covers the scope of this warehouse.',
            countId: 'count-1',
            warehouseId: 'wh-1',
          },
        ],
      }),
    })

    expect(document.querySelectorAll('[data-slot="policy-advisory-row"]')).toHaveLength(0)
    expect(screen.queryByText('An inventory count covers the scope of this warehouse.')).toBeNull()
  })

  it('renders nothing at all for an action code outside the canonical vocabulary', () => {
    // The policy response types `action` as a bare string, so an action this
    // build has never heard of arrives here. Rendering it would put a button on
    // screen with no label, no permission code and no route; dropping it is the
    // documented behaviour (`toDocumentActionType`).
    renderBar({
      policy: makePolicy([
        availability({ action: 'document.publish' }),
        availability({ action: 'Submit', confirmationRequired: true }),
      ]),
    })

    expect(screen.queryByRole('button', { name: 'تنفيذ الإجراء' })).toBeNull()
    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeInTheDocument()
  })

  it('does not resolve a permission-style prefixed code into an action either', () => {
    // `document.submit` was a frontend permission spelling; the policy serves the
    // bare contract codes, and the narrowing happens before any label lookup, so
    // the prefixed form is dropped rather than re-mapped.
    renderBar({
      policy: makePolicy([
        availability({ action: 'document.submit', confirmationRequired: true }),
        availability({ action: 'Submit', confirmationRequired: true }),
      ]),
    })

    expect(screen.getAllByRole('button', { name: 'إرسال للترحيل' })).toHaveLength(1)
  })

  it('renders nothing when the policy is null', () => {
    renderBar({ policy: null })

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('removes actions rejected by the permission gate while keeping permitted ones', () => {
    renderBar({
      policy: makePolicy([
        availability({ action: 'Submit', confirmationRequired: true }),
        availability({ action: 'Post', confirmationRequired: true }),
      ]),
      isActionPermitted: (action: DocumentActionType) => action !== 'Submit',
    })

    expect(screen.queryByRole('button', { name: 'إرسال للترحيل' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ترحيل' })).toBeInTheDocument()
  })

  it('keeps Disabled-but-permitted actions rendered as disabled buttons', () => {
    renderBar({
      policy: makePolicy([
        availability({
          action: 'Post',
          allowed: false,
          presentation: 'Disabled',
          reason: 'Insufficient quantity to cover the issue lines.',
          reasonCode: SIGNED_COPY_REQUIRED_CODE,
        }),
      ]),
      isActionPermitted: () => true,
    })

    const postButton = screen.getByRole('button', { name: 'ترحيل' })
    expect(postButton).toBeDisabled()
    expect(postButton).toHaveAttribute('title', SIGNED_COPY_REQUIRED_AR)
  })

  it('removes Hidden actions before applying the permission filter without crashing', () => {
    renderBar({
      policy: makePolicy([
        availability({ action: 'Reverse', allowed: false, presentation: 'Hidden' }),
        availability({ action: 'Submit', confirmationRequired: true }),
      ]),
      isActionPermitted: () => true,
    })

    expect(screen.queryByRole('button', { name: 'عكس' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeInTheDocument()
  })

  it('keeps the historical rendering when the permission gate prop is omitted', () => {
    renderBar({
      policy: makePolicy([
        availability({ action: 'Submit', confirmationRequired: true }),
        availability({ action: 'Post', confirmationRequired: true }),
      ]),
    })

    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ترحيل' })).toBeInTheDocument()
  })
})

/**
 * F-15: a Disabled action's reason must be readable in the body, not only in
 * the hover-only `title`. Two rules keep it honest — no duplicate of a sentence
 * the blocker alert already renders, and one note per distinct reason.
 */
describe('LifecycleActionBar — disabled action reasons (F-15)', () => {
  /** A second governed code, distinct from the signed-copy one. */
  const NOT_EDITABLE_CODE = 'WAREHOUSE_DOCUMENTS_NOT_EDITABLE'
  const NOT_EDITABLE_AR = 'لا يمكن تعديل المستند إلا في حالة المسودة.'

  it('states a Disabled reason visibly in the body in addition to the title', () => {
    renderBar({
      policy: makePolicy([
        availability({
          action: 'Post',
          allowed: false,
          presentation: 'Disabled',
          reason: 'Insufficient quantity to cover the issue lines.',
          reasonCode: SIGNED_COPY_REQUIRED_CODE,
        }),
      ]),
    })

    const postButton = screen.getByRole('button', { name: 'ترحيل' })
    expect(postButton).toBeDisabled()
    // The hover tooltip stays …
    expect(postButton).toHaveAttribute('title', SIGNED_COPY_REQUIRED_AR)
    // … and the same sentence is now rendered in the body, so a touch or
    // keyboard user who cannot hover still reads WHY the action is blocked.
    const note = document.querySelector('[data-slot="disabled-action-reason"]')
    expect(note).not.toBeNull()
    expect(note).toHaveTextContent(SIGNED_COPY_REQUIRED_AR)
  })

  it('renders no reason note when every presented action is Enabled', () => {
    renderBar({
      policy: makePolicy([availability({ action: 'Submit', confirmationRequired: true })]),
    })

    expect(document.querySelector('[data-slot="disabled-action-reasons"]')).toBeNull()
    expect(document.querySelector('[data-slot="disabled-action-reason"]')).toBeNull()
  })

  it('renders no note and no English when a Disabled reason code is unmapped', () => {
    renderBar({
      policy: makePolicy([
        availability({
          action: 'Post',
          allowed: false,
          presentation: 'Disabled',
          reason: 'Insufficient quantity to cover the issue lines.',
          reasonCode: 'A_CODE_NOBODY_TRANSLATED',
        }),
      ]),
    })

    expect(screen.getByRole('button', { name: 'ترحيل' })).toBeDisabled()
    expect(document.querySelector('[data-slot="disabled-action-reason"]')).toBeNull()
    expect(screen.queryByText('Insufficient quantity to cover the issue lines.')).toBeNull()
  })

  it('does not repeat a reason the blocker alert already renders', () => {
    renderBar({
      policy: makePolicy(
        [
          availability({
            action: 'Post',
            allowed: false,
            presentation: 'Disabled',
            reasonCode: SIGNED_COPY_REQUIRED_CODE,
          }),
        ],
        {
          blockers: [
            {
              action: 'Post',
              code: SIGNED_COPY_REQUIRED_CODE,
              message: 'The signed copy of the document is required before posting.',
            },
          ],
        },
      ),
    })

    // The alert owns the sentence; the bar must not print it twice.
    expect(screen.getAllByText(SIGNED_COPY_REQUIRED_AR)).toHaveLength(1)
    expect(document.querySelector('[data-slot="disabled-action-reason"]')).toBeNull()
  })

  it('shows one note per distinct reason across several Disabled actions', () => {
    renderBar({
      policy: makePolicy([
        availability({
          action: 'Post',
          allowed: false,
          presentation: 'Disabled',
          reasonCode: SIGNED_COPY_REQUIRED_CODE,
        }),
        availability({
          action: 'Reverse',
          allowed: false,
          presentation: 'Disabled',
          reasonCode: SIGNED_COPY_REQUIRED_CODE,
        }),
        availability({
          action: 'Cancel',
          allowed: false,
          presentation: 'Disabled',
          reasonCode: NOT_EDITABLE_CODE,
        }),
      ]),
    })

    const notes = document.querySelectorAll('[data-slot="disabled-action-reason"]')
    expect(notes).toHaveLength(2)
    expect(screen.getByText(SIGNED_COPY_REQUIRED_AR)).toBeInTheDocument()
    expect(screen.getByText(NOT_EDITABLE_AR)).toBeInTheDocument()
  })

  it('shows the server-supplied Arabic reason for a state-blocked action', () => {
    // The bug F-15 fixes: the server sends an Arabic `reason`, but the bar used
    // to ignore it and the code lookup was unmapped, so nothing rendered.
    const reasonAr = 'حالة الوثيقة الحالية لا تسمح بهذا الإجراء.'
    renderBar({
      policy: makePolicy([
        availability({
          action: 'Post',
          allowed: false,
          presentation: 'Disabled',
          reasonCode: 'STATE_NOT_ALLOWED',
          reason: reasonAr,
        }),
      ]),
    })

    const postButton = screen.getByRole('button', { name: 'ترحيل' })
    expect(postButton).toBeDisabled()
    expect(postButton).toHaveAttribute('title', reasonAr)
    const notes = document.querySelectorAll('[data-slot="disabled-action-reason"]')
    expect(notes).toHaveLength(1)
    expect(notes[0]).toHaveTextContent(reasonAr)
  })

  it('does not repeat a server-supplied reason the blocker alert already renders', () => {
    const reasonAr = 'لا تُتيح حالة الوثيقة ولا صلاحياتك تنفيذ هذا الإجراء.'
    renderBar({
      policy: makePolicy(
        [
          availability({
            action: 'Post',
            allowed: false,
            presentation: 'Disabled',
            reasonCode: 'STATE_OR_PERMISSION_NOT_ALLOWED',
            reason: reasonAr,
          }),
        ],
        {
          blockers: [
            {
              action: 'Post',
              code: 'STATE_OR_PERMISSION_NOT_ALLOWED',
              message: reasonAr,
            },
          ],
        },
      ),
    })

    // The alert owns the sentence; the bar must not print it twice.
    expect(screen.getAllByText(reasonAr)).toHaveLength(1)
    expect(document.querySelector('[data-slot="disabled-action-reason"]')).toBeNull()
  })
})
