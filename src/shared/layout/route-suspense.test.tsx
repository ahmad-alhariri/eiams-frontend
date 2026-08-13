import { lazy, type ComponentType } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RouteSuspense } from '@/shared/layout/route-suspense'

function makeDelayedView(placeholder: string): ComponentType {
  return lazy(async () => {
    await new Promise((resolve) => setTimeout(resolve, 70))
    return { default: () => <p>{placeholder}</p> }
  })
}

describe('RouteSuspense', () => {
  it('shows the route spinner while a lazy chunk suspends, then reveals content', async () => {
    const DelayedView = makeDelayedView('المحتوى الفعلي للصفحة')
    render(
      <RouteSuspense>
        <DelayedView />
      </RouteSuspense>,
    )

    expect(screen.getByRole('status', { name: 'جارٍ تحميل الصفحة...' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="route-suspense-fallback"]')).not.toBeNull()

    expect(await screen.findByText('المحتوى الفعلي للصفحة')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('accepts a custom label for domain-specific wording', async () => {
    const DelayedReport = makeDelayedView('محتوى التقرير')
    render(
      <RouteSuspense label="جارٍ تحميل التقرير...">
        <DelayedReport />
      </RouteSuspense>,
    )

    expect(screen.getByRole('status', { name: 'جارٍ تحميل التقرير...' })).toBeInTheDocument()
    expect(await screen.findByText('محتوى التقرير')).toBeInTheDocument()
  })

  it('renders children immediately when they do not suspend', () => {
    render(
      <RouteSuspense>
        <p>محتويات جاهزة</p>
      </RouteSuspense>,
    )

    expect(screen.getByText('محتويات جاهزة')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
