import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { useConfirm, type ConfirmRequest } from '@/shared/hooks/use-confirm'

type Deferred = {
  promise: Promise<void>
  reject: (error: unknown) => void
  resolve: () => void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

function Harness({ requests }: { requests: Record<string, ConfirmRequest> }) {
  const { confirm, element } = useConfirm()
  const [outcome, setOutcome] = useState('')

  const handleOpen = async (key: string) => {
    try {
      const result = await confirm(requests[key]!)
      setOutcome(JSON.stringify(result))
    } catch (error) {
      setOutcome(error instanceof Error ? `error:${error.message}` : 'error:unknown')
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void handleOpen('basic')}>
        فتح التأكيد
      </button>
      <button type="button" data-testid="second-trigger" onClick={() => void handleOpen('second')}>
        فتح تأكيد ثانٍ
      </button>
      <output data-testid="outcome">{outcome}</output>
      {element}
    </div>
  )
}

function renderHarness(requests: Record<string, ConfirmRequest>) {
  render(<Harness requests={requests} />)
  return { user: userEvent.setup() }
}

const basicRequest: ConfirmRequest = {
  message: 'هل تريد متابعة هذا الإجراء؟',
  requireReason: true,
}

describe('useConfirm', () => {
  it('opens the dialog and resolves confirmed with the entered reason on confirm', async () => {
    const { user } = renderHarness({ basic: basicRequest })

    await user.click(screen.getByRole('button', { name: 'فتح التأكيد' }))
    await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    await user.type(screen.getByLabelText('سبب الإجراء'), 'سبب المراجعة')
    await user.click(screen.getByRole('button', { name: 'تأكيد' }))

    await waitFor(() => expect(screen.getByTestId('outcome')).toHaveTextContent('"confirmed":true'))
    expect(screen.getByTestId('outcome')).toHaveTextContent('سبب المراجعة')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('resolves confirmed false when the dialog is cancelled', async () => {
    const { user } = renderHarness({ basic: basicRequest })

    await user.click(screen.getByRole('button', { name: 'فتح التأكيد' }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'إلغاء' }))

    await waitFor(() =>
      expect(screen.getByTestId('outcome')).toHaveTextContent('"confirmed":false'),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps the dialog open on empty reason until a reason is provided', async () => {
    const { user } = renderHarness({ basic: basicRequest })

    await user.click(screen.getByRole('button', { name: 'فتح التأكيد' }))
    await user.click(screen.getByRole('button', { name: 'تأكيد' }))

    expect(screen.getByRole('alert')).toHaveTextContent('سبب الإجراء مطلوب')
    expect(screen.getByTestId('outcome')).toHaveTextContent('')

    await user.type(screen.getByLabelText('سبب الإجراء'), 'سبب مقبول')
    await user.click(screen.getByRole('button', { name: 'تأكيد' }))

    await waitFor(() => expect(screen.getByTestId('outcome')).toHaveTextContent('"confirmed":true'))
    expect(screen.getByTestId('outcome')).toHaveTextContent('سبب مقبول')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('disables the actions while execute is pending and resolves after it settles', async () => {
    const deferred = createDeferred()
    let executedReason: string | undefined
    const { user } = renderHarness({
      basic: {
        ...basicRequest,
        execute: async (reason) => {
          executedReason = reason
          await deferred.promise
        },
      },
    })

    await user.click(screen.getByRole('button', { name: 'فتح التأكيد' }))
    await user.type(screen.getByLabelText('سبب الإجراء'), 'تنفيذ مؤجل')
    await user.click(screen.getByRole('button', { name: 'تأكيد' }))

    const busyButton = await screen.findByRole('button', { name: 'جارٍ التنفيذ...' })
    expect(busyButton).toBeDisabled()
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled()

    deferred.resolve()
    await waitFor(() => expect(screen.getByTestId('outcome')).toHaveTextContent('"confirmed":true'))
    expect(executedReason).toBe('تنفيذ مؤجل')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps the dialog open and rejects the confirm promise when execute fails', async () => {
    const deferred = createDeferred()
    const { user } = renderHarness({
      basic: {
        message: 'هل تريد تنفيذ العملية؟',
        execute: () => deferred.promise,
      },
    })

    await user.click(screen.getByRole('button', { name: 'فتح التأكيد' }))
    await user.click(screen.getByRole('button', { name: 'تأكيد' }))
    await screen.findByRole('button', { name: 'جارٍ التنفيذ...' })

    deferred.reject(new Error('فشل تنفيذ العملية'))

    await waitFor(() =>
      expect(screen.getByTestId('outcome')).toHaveTextContent('error:فشل تنفيذ العملية'),
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تأكيد' })).toBeEnabled()
  })

  it('resolves confirmed false immediately for a second confirm call while open', async () => {
    const { user } = renderHarness({ basic: basicRequest })

    await user.click(screen.getByRole('button', { name: 'فتح التأكيد' }))
    await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })

    const secondTrigger = document.querySelector('[data-testid="second-trigger"]')
    fireEvent.click(secondTrigger!)

    await waitFor(() =>
      expect(screen.getByTestId('outcome')).toHaveTextContent('"confirmed":false'),
    )
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
    expect(screen.getByRole('alertdialog', { name: 'تأكيد الإجراء' })).toBeInTheDocument()
  })
})
