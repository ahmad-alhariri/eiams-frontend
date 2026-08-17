import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppChromeBoundary } from '@/shared/layout/app-chrome-boundary'

describe('AppChromeBoundary', () => {
  let recovered = false

  function FlakyHeader() {
    if (!recovered) {
      throw new Error('header exploded')
    }
    return <header>محتوى الشريط العلوي</header>
  }

  beforeEach(() => {
    recovered = false
    vi.restoreAllMocks()
  })

  it('renders the chrome region when nothing crashes', () => {
    render(
      <AppChromeBoundary label="الشريط العلوي">
        <header>محتوى الشريط العلوي</header>
      </AppChromeBoundary>,
    )

    expect(screen.getByText('محتوى الشريط العلوي')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('collapses a crashed region into an Arabic fallback with retry', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppChromeBoundary label="القائمة الجانبية">
        <FlakyHeader />
      </AppChromeBoundary>,
    )

    const alert = screen.getByRole('alert', { name: 'القائمة الجانبية' })
    expect(alert).toHaveTextContent('تعذر عرض القائمة الجانبية')
    expect(alert).toHaveTextContent('header exploded')
    expect(consoleError).toHaveBeenCalledWith(
      '[chrome] Failed to render the القائمة الجانبية region.',
      expect.any(Error),
    )

    recovered = true
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('محتوى الشريط العلوي')).toBeInTheDocument()
  })
})
