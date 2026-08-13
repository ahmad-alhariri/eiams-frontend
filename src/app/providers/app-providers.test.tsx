import { render, screen } from '@testing-library/react'
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers/app-providers'

function QueryClientProbe() {
  const client = useQueryClient()
  return (
    <span data-testid="query-client-probe">{client instanceof QueryClient ? 'ok' : 'missing'}</span>
  )
}

describe('AppProviders', () => {
  it('mounts a QueryClient for server state consumers', () => {
    render(
      <AppProviders>
        <QueryClientProbe />
      </AppProviders>,
    )

    expect(screen.getByTestId('query-client-probe')).toHaveTextContent('ok')
  })

  it('renders children inside the provider tree', () => {
    render(
      <AppProviders>
        <div data-testid="child">المحتوى</div>
      </AppProviders>,
    )

    expect(screen.getByTestId('child')).toHaveTextContent('المحتوى')
  })

  it('mounts the toast surface once', () => {
    render(
      <AppProviders>
        <span>نقطة الدخول</span>
      </AppProviders>,
    )

    expect(screen.getByText('نقطة الدخول')).toBeInTheDocument()
  })
})
