import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AppLayout } from '@/shared/layout/app-layout'
import { RouteFocusAnnouncer } from '@/shared/layout/route-focus-announcer'
import { APP_MAIN_ID, matchRouteKey } from '@/shared/layout/route-keys'

/**
 * The keyboard and screen-reader audit (eiams-frontend-e25-t02).
 *
 * Two defects were found by measurement and fixed:
 *  - no skip-to-content link, so a keyboard user had to tab through the whole
 *    navigation sidebar on every page load (WCAG 2.4.1 bypass blocks);
 *  - the app never moved focus and never announced a route change, so after a
 *    client-side navigation the screen reader stayed on the activated
 *    navigation link (WCAG 2.4.3 focus order, 4.1.3 status messages).
 *
 * These tests pin the behaviour, not the implementation. A removal of the skip
 * link, of the focusable main region or of the announcement fails here.
 */
describe('keyboard and screen-reader workflow', () => {
  it('offers a skip link as the first focusable element', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout />
      </MemoryRouter>,
    )

    const skipLink = screen.getByRole('link', { name: 'تخطَّ إلى المحتوى' })
    const focusable = screen.getAllByRole('link')
    expect(focusable[0]).toBe(skipLink)
    expect(skipLink).toHaveAttribute('href', '#' + APP_MAIN_ID)
  })

  it('targets a main region that can actually receive focus', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout />
      </MemoryRouter>,
    )

    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', APP_MAIN_ID)
    expect(main).toHaveAttribute('tabindex', '-1')
  })

  it('resolves the skip link to that same focusable region', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout />
      </MemoryRouter>,
    )

    const skipLink = screen.getByRole('link', { name: 'تخطَّ إلى المحتوى' })
    const target = document.querySelector(skipLink.getAttribute('href') ?? '')
    expect(target).toBe(screen.getByRole('main'))
    expect(target).toHaveAttribute('tabindex', '-1')
  })

  it('maps a pathname to the route key that owns it', () => {
    expect(matchRouteKey('/')).toBe('dashboard')
    expect(matchRouteKey('/custody/register')).toBe('custodyActive')
    expect(matchRouteKey('/assets')).toBe('assets')
    expect(matchRouteKey('/assets/42')).toBe('assetDetail')
    expect(matchRouteKey('/documents/receiving/7')).toBe('documentReceivingDetail')
    expect(matchRouteKey('/not-a-route')).toBeNull()
  })

  it('announces the new page in Arabic after a route change', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteFocusAnnouncer />
        <main id={APP_MAIN_ID} tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Link to="/custody/register">انتقل</Link>} />
            <Route path="/custody/register" element={<span>العهد</span>} />
          </Routes>
        </main>
      </MemoryRouter>,
    )

    const announcer = screen.getByRole('status')
    expect(announcer).toHaveAttribute('aria-live', 'polite')
    expect(announcer).toHaveTextContent('')

    await user.click(screen.getByRole('link', { name: 'انتقل' }))

    await waitFor(() => {
      expect(announcer).toHaveTextContent('سجل العهد')
    })
    expect(screen.getByRole('main')).toHaveFocus()
  })
})
