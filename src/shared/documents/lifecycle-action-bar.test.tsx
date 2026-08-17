import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  LifecycleActionBar,
  type LifecycleActionBarProps,
} from '@/shared/documents/lifecycle-action-bar'
import type {
  ActionAvailability,
  DocumentActionType,
  DocumentPolicy,
} from '@/shared/types/generated/eiams-v1'

function availability(overrides: Partial<ActionAvailability>): ActionAvailability {
  return {
    action: 'Submit',
    allowed: true,
    confirmationRequired: false,
    presentation: 'Enabled',
    reasonAr: null,
    reasonCode: null,
    reasonRequired: false,
    ...overrides,
  }
}

function makePolicy(
  actions: ActionAvailability[],
  overrides: Partial<DocumentPolicy> = {},
): DocumentPolicy {
  return {
    documentId: 'doc-1',
    documentStatus: 'Draft',
    evaluatedAt: '2026-08-11T08:00:00Z',
    policyKind: 'Generic',
    rowVersion: 1,
    signedOriginalSatisfied: true,
    actions,
    advisories: [],
    blockers: [],
    ...overrides,
  }
}

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

  it('renders Disabled actions disabled with the Arabic reason as tooltip', () => {
    renderBar({
      policy: makePolicy([
        availability({
          action: 'Post',
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'الرصيد غير كافٍ لتغطية بنود الصرف',
          reasonCode: 'insufficient_balance',
        }),
      ]),
    })

    const postButton = screen.getByRole('button', { name: 'ترحيل' })
    expect(postButton).toBeDisabled()
    expect(postButton).toHaveAttribute('title', 'الرصيد غير كافٍ لتغطية بنود الصرف')
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

  it('renders blockers as an Arabic alert row and advisories as a muted info row', () => {
    renderBar({
      policy: makePolicy([availability({ action: 'Submit', confirmationRequired: true })], {
        blockers: [
          {
            code: 'signed_original_missing',
            messageAr: 'يجب إرفاق النسخة الموقعة من المستند قبل الترحيل',
            field: null,
          },
        ],
        advisories: [
          {
            code: 'ActiveSoftFreeze',
            severity: 'Warning',
            messageAr: 'يوجد جرد نشط على هذا المستودع وقد تتجمد الحركة مؤقتاً',
            scopeSummaryAr: 'مستودع دمشق المركزي',
            countReference: 'JC-2026-0114',
            overlapState: 'Provisional',
            countId: 'count-1',
            warehouseId: 'wh-1',
          },
        ],
      }),
    })

    const alertRow = screen.getByRole('alert')
    expect(alertRow).toHaveTextContent('يجب إرفاق النسخة الموقعة من المستند قبل الترحيل')
    expect(alertRow.querySelector('[data-slot="policy-blocker-icon"]')).not.toBeNull()

    expect(
      screen.getByText(/يوجد جرد نشط على هذا المستودع وقد تتجمد الحركة مؤقتاً/),
    ).toBeInTheDocument()
    expect(screen.getByText(/مستودع دمشق المركزي/)).toBeInTheDocument()
    expect(screen.getByText(/JC-2026-0114/)).toBeInTheDocument()
  })

  it('falls back to a generic Arabic label for unknown action keys', () => {
    renderBar({
      policy: makePolicy([availability({ action: 'document.publish' as DocumentActionType })]),
    })

    expect(screen.getByRole('button', { name: 'تنفيذ الإجراء' })).toBeInTheDocument()
  })

  it('resolves permission-style prefixed codes to the same Arabic label', () => {
    renderBar({
      policy: makePolicy([
        availability({
          action: 'document.submit' as DocumentActionType,
          confirmationRequired: true,
        }),
      ]),
    })

    expect(screen.getByRole('button', { name: 'إرسال للترحيل' })).toBeInTheDocument()
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
      isActionPermitted: (action) => action !== 'Submit',
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
          reasonAr: 'الرصيد غير كافٍ لتغطية بنود الصرف',
          reasonCode: 'insufficient_balance',
        }),
      ]),
      isActionPermitted: () => true,
    })

    const postButton = screen.getByRole('button', { name: 'ترحيل' })
    expect(postButton).toBeDisabled()
    expect(postButton).toHaveAttribute('title', 'الرصيد غير كافٍ لتغطية بنود الصرف')
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
