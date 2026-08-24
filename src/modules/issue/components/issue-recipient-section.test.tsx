import { QueryClientProvider } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { HttpResponse, http } from 'msw'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Resolver } from 'react-hook-form'
import { FormProvider, useForm } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ISSUE_RECIPIENT_TYPE_LABELS_AR,
  toIssueInfo,
} from '@/modules/issue/schemas/issue-info.schema'
import { createQueryClient } from '@/shared/services/query.client'
import type { CounterpartOption } from '@/shared/types/generated/eiams-v1'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import {
  IssueRecipientSection,
  issuePetalFormSchema,
  type IssuePetalFormValues,
} from './issue-recipient-section'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

const RECIPIENT_OPTION: CounterpartOption = {
  displayName: 'أحمد محمد',
  id: fixtureUuid(64),
  secondaryLabelAr: 'أمين مستودع',
  status: 'Active',
  type: 'Employee',
}

function useCounterpartHandler() {
  server.use(
    http.get(`${API_BASE_URL}/counterparts`, () =>
      HttpResponse.json({ items: [RECIPIENT_OPTION], meta: { page: 0, pageSize: 10, total: 1 } }),
    ),
  )
}

type SubmitSpy = (values: IssuePetalFormValues) => void

function createWrapper(onSubmit?: SubmitSpy, sectionDisabled = false) {
  const client = createQueryClient()

  return function PetalWrapper() {
    const form = useForm<IssuePetalFormValues>({
      resolver: zodResolver(issuePetalFormSchema) as Resolver<IssuePetalFormValues>,
      defaultValues: {
        petal: {
          issueTo: {
            // The unselected state is the empty string at runtime; the cast
            // mirrors the receiving petal test's resolver-shaped defaults.
            recipientType: '',
            recipientId: '',
            issueReason: '',
          } as unknown as IssuePetalFormValues['petal']['issueTo'],
          issueToDisplayName: '',
        },
      },
    })
    return (
      <QueryClientProvider client={client}>
        <FormProvider {...form}>
          <form
            onSubmit={(event) =>
              void form.handleSubmit((values) => onSubmit?.(values as IssuePetalFormValues))(event)
            }
            noValidate
          >
            <IssueRecipientSection disabled={sectionDisabled} />
            <button type="submit">حفظ</button>
          </form>
        </FormProvider>
      </QueryClientProvider>
    )
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('IssueRecipientSection', () => {
  it('renders the type selector and reason without a recipient selector until a type is chosen', () => {
    render(<IssueRecipientSection />, { wrapper: createWrapper() })

    expect(screen.getByRole('group', { name: 'الجهة المستلمة' })).toBeInTheDocument()
    expect(screen.getByLabelText('نوع الجهة المستلمة')).toBeInTheDocument()
    expect(screen.getByLabelText('سبب الصرف')).toBeInTheDocument()
    expect(screen.queryByLabelText('الجهة المستلمة')).not.toBeInTheDocument()
  })

  it('offers the four contract recipient types through the type selector', async () => {
    const user = userEvent.setup()
    render(<IssueRecipientSection />, { wrapper: createWrapper() })

    await user.click(screen.getByLabelText('نوع الجهة المستلمة'))
    for (const [, labelAr] of Object.entries(ISSUE_RECIPIENT_TYPE_LABELS_AR)) {
      expect(await screen.findByRole('option', { name: labelAr })).toBeInTheDocument()
    }
  })

  it('shows the counterpart selector once a type is chosen and writes id + display name on selection', async () => {
    useCounterpartHandler()
    let submitted: IssuePetalFormValues | undefined
    const user = userEvent.setup()
    render(<IssueRecipientSection />, { wrapper: createWrapper((values) => (submitted = values)) })

    await user.click(screen.getByLabelText('نوع الجهة المستلمة'))
    await user.click(await screen.findByRole('option', { name: 'موظف' }))
    expect(screen.getByLabelText('الجهة المستلمة')).toBeInTheDocument()

    const combo = screen.getByRole('combobox', { name: 'الجهة المستلمة' })
    await user.click(combo)
    await user.type(combo, 'أحمد')
    await user.click(await screen.findByRole('option', { name: /أحمد محمد/ }))
    await user.type(screen.getByLabelText('سبب الصرف'), 'تجهيز مكتب إدارة التقنية')

    await user.click(screen.getByRole('button', { name: 'حفظ' }))
    expect(submitted?.petal.issueTo.recipientId).toBe(RECIPIENT_OPTION.id)
    expect(submitted?.petal.issueToDisplayName).toBe('أحمد محمد')
    expect(submitted?.petal.issueTo.issueReason).toBe('تجهيز مكتب إدارة التقنية')
    // The page maps out with the captured sibling name.
    expect(toIssueInfo(submitted!.petal.issueTo, submitted!.petal.issueToDisplayName)).toMatchObject({
      recipientDisplayName: 'أحمد محمد',
    })
  })

  it('clears the selected recipient when the recipient type changes', async () => {
    useCounterpartHandler()
    const user = userEvent.setup()

    // State-level harness: the live RHF values are mirrored into the DOM via
    // a probe element, so the reset rule is asserted without needing a valid
    // submission (a cleared recipientId legitimately fails Zod and blocks
    // submit).
    function Harness() {
      const form = useForm<IssuePetalFormValues>({
        resolver: zodResolver(issuePetalFormSchema) as Resolver<IssuePetalFormValues>,
        defaultValues: {
          petal: {
            issueTo: {
              recipientType: '',
              recipientId: '',
              issueReason: '',
            } as unknown as IssuePetalFormValues['petal']['issueTo'],
            issueToDisplayName: '',
          },
        },
      })
      const recipientId = form.watch('petal.issueTo.recipientId')
      const displayName = form.watch('petal.issueToDisplayName')
      return (
        <QueryClientProvider client={createQueryClient()}>
          <FormProvider {...form}>
            <IssueRecipientSection />
            <div
              data-testid="state-probe"
              data-recipient-id={recipientId}
              data-display-name={displayName}
            />
          </FormProvider>
        </QueryClientProvider>
      )
    }

    render(<Harness />)

    await user.click(screen.getByLabelText('نوع الجهة المستلمة'))
    await user.click(await screen.findByRole('option', { name: 'موظف' }))
    const combo = screen.getByRole('combobox', { name: 'الجهة المستلمة' })
    await user.click(combo)
    await user.type(combo, 'أحمد')
    await user.click(await screen.findByRole('option', { name: /أحمد محمد/ }))
    expect(screen.getByTestId('state-probe')).toHaveAttribute(
      'data-recipient-id',
      RECIPIENT_OPTION.id,
    )
    expect(screen.getByTestId('state-probe')).toHaveAttribute('data-display-name', 'أحمد محمد')

    // Switch type: the previously captured Employee selection must not survive.
    await user.click(screen.getByLabelText('نوع الجهة المستلمة'))
    await user.click(await screen.findByRole('option', { name: 'موقع' }))
    expect(screen.getByTestId('state-probe')).toHaveAttribute('data-recipient-id', '')
    expect(screen.getByTestId('state-probe')).toHaveAttribute('data-display-name', '')
  })

  it('surfaces the exact Arabic schema messages when required fields are empty', async () => {
    const user = userEvent.setup()
    render(<IssueRecipientSection />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(await screen.findByText('يجب اختيار نوع الجهة المستلمة.')).toBeInTheDocument()
    expect(screen.getByText('يجب إدخال سبب الصرف.')).toBeInTheDocument()
  })

  it('requires an explicit recipient choice after a type is selected', async () => {
    const user = userEvent.setup()
    render(<IssueRecipientSection />, { wrapper: createWrapper() })

    await user.click(screen.getByLabelText('نوع الجهة المستلمة'))
    await user.click(await screen.findByRole('option', { name: 'جهة خارجية' }))
    await user.type(screen.getByLabelText('سبب الصرف'), 'صرف بدون تحديد جهة')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(await screen.findByText('يجب اختيار الجهة المستلمة من القائمة.')).toBeInTheDocument()
  })

  it('disables every control while disabled', () => {
    render(<IssueRecipientSection disabled />, {
      wrapper: createWrapper(undefined, true),
    })

    expect(screen.getByLabelText('نوع الجهة المستلمة')).toBeDisabled()
    expect(screen.getByLabelText('سبب الصرف')).toBeDisabled()
  })
})
