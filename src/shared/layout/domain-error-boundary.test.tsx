import { createMemoryRouter, RouterProvider } from 'react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { DomainErrorBoundary } from '@/shared/layout/domain-error-boundary'

function HealthyPage() {
  return <p>صفحة سليمة</p>
}

let recovered = false
function ErrorCrash() {
  if (!recovered) {
    throw new Error('خطأ تجريبي من داخل الصفحة')
  }
  return <p>تعافى العرض بعد إعادة المحاولة</p>
}

function resetRecovery() {
  recovered = false
}

describe('DomainErrorBoundary', () => {
  it('renders children normally and exposes the boundary slot', async () => {
    resetRecovery()
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <DomainErrorBoundary>
              <HealthyPage />
            </DomainErrorBoundary>
          ),
        },
      ],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('صفحة سليمة')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="domain-error-boundary"]')).not.toBeNull()
  })

  it('catches a render crash and shows the Arabic error state with retry', async () => {
    resetRecovery()
    const user = userEvent.setup()
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <DomainErrorBoundary>
              <ErrorCrash />
            </DomainErrorBoundary>
          ),
        },
      ],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'تعذر عرض الصفحة' })).toBeInTheDocument()
    expect(screen.getByText(/خطأ تجريبي من داخل الصفحة/)).toBeInTheDocument()

    recovered = true
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(screen.getByText('تعافى العرض بعد إعادة المحاولة')).toBeInTheDocument()
  })

  it('clears the error when navigating to another route', async () => {
    resetRecovery()
    const router = createMemoryRouter(
      [
        {
          path: '/a',
          element: (
            <DomainErrorBoundary>
              <ErrorCrash />
            </DomainErrorBoundary>
          ),
        },
        {
          path: '/b',
          element: (
            <DomainErrorBoundary>
              <HealthyPage />
            </DomainErrorBoundary>
          ),
        },
      ],
      { initialEntries: ['/a'] },
    )
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    router.navigate('/b')
    expect(await screen.findByText('صفحة سليمة')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
