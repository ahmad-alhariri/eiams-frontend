import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '@/app/app'
import { appRouter } from '@/app/app-router'
import { AppProviders } from '@/app/providers/app-providers'

function renderApp() {
  return render(
    <AppProviders>
      <App />
    </AppProviders>,
  )
}

describe('App entry', () => {
  it('mounts the router and renders the app frame', async () => {
    renderApp()

    act(() => {
      appRouter.navigate('/dev/gallery')
    })

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'معرض المكونات المشتركة' },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('returns the not-found page for an unlisted URL', async () => {
    renderApp()

    act(() => {
      appRouter.navigate('/unlisted/unwired')
    })

    expect(await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })).toBeInTheDocument()
  })

  it('cleans up rendered trees between tests', () => {
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})
