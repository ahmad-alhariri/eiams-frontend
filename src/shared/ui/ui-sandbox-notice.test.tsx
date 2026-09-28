import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { UiSandboxNotice } from '@/shared/ui/ui-sandbox-notice'

describe('UiSandboxNotice', () => {
  it('renders nothing when no fixture is active', () => {
    const { container } = render(<UiSandboxNotice fixtures={[]} />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('marks the session so it cannot be read as integration evidence', () => {
    render(<UiSandboxNotice fixtures={['mocks', 'authBypass']} />)

    const notice = screen.getByRole('status')

    expect(notice).toHaveTextContent('بيئة الاختبار')
    expect(notice).toHaveTextContent('البيانات لا تأتي من الخادم الحقيقي')
  })

  it('names each active fixture in Arabic', () => {
    render(<UiSandboxNotice fixtures={['mocks']} />)

    expect(screen.getByRole('status')).toHaveTextContent('بيانات تجريبية')
  })

  it('announces politely without interrupting', () => {
    render(<UiSandboxNotice fixtures={['authBypass']} />)

    const notice = screen.getByRole('status')

    expect(notice).toHaveAttribute('aria-live', 'polite')
  })
})
