import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AppLayout } from '@/shared/layout/app-layout'
import { createQueryClient } from '@/shared/services/query.client'

function renderLayout() {
  const queryClient = createQueryClient()
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [{ path: '/', element: <div data-testid="page-content">محتوى الصفحة</div> }],
      },
    ],
    { initialEntries: ['/'] },
  )

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AppLayout', () => {
  it('assembles the four chrome regions around the routed page', () => {
    const { container } = renderLayout()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'محتوى الصفحة' })).toBeInTheDocument()
    expect(screen.getByText('محتوى الصفحة')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl')
  })

  it('exposes the brand block and sidebar toggles in the header', () => {
    renderLayout()

    expect(screen.getByRole('link', { name: 'الرئيسية' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'فتح قائمة التنقل' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'طي القائمة الجانبية' })).toBeInTheDocument()
  })

  it('prints the authority footer in the muted stone scale', () => {
    renderLayout()

    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent('الهيئة العامة للرقابة والتفتيش')
    expect(footer).toHaveClass('text-stone')
  })
})
