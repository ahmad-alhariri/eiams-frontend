import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { Breadcrumbs } from '@/shared/layout/header/breadcrumb'
import { resolveRouteTrail } from '@/shared/layout/header/breadcrumb-utils'

function renderBreadcrumbsAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Breadcrumbs /> },
      { path: '*', element: <Breadcrumbs /> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('resolveRouteTrail', () => {
  it('returns only the dashboard for the home path', () => {
    expect(resolveRouteTrail('/')).toEqual(['dashboard'])
  })

  it('walks parent metadata for a nested list page', () => {
    expect(resolveRouteTrail('/catalog/categories')).toEqual([
      'dashboard',
      'catalogDomains',
      'catalogCategories',
    ])
  })

  it('matches detail variants through their :param patterns', () => {
    expect(resolveRouteTrail('/documents/receiving/42')).toEqual([
      'dashboard',
      'documentReceiving',
      'documentReceivingDetail',
    ])
    expect(resolveRouteTrail('/adjustments/7')).toEqual([
      'dashboard',
      'adjustments',
      'adjustmentDetail',
    ])
  })

  it('returns a single-item trail for dev/system surfaces without parents', () => {
    expect(resolveRouteTrail('/dev/gallery')).toEqual(['devGallery'])
    expect(resolveRouteTrail('/not-found')).toEqual(['notFound'])
  })

  it('returns null for unlisted paths (404 surfaces)', () => {
    expect(resolveRouteTrail('/totally/unknown/route')).toBeNull()
  })
})

describe('Breadcrumbs', () => {
  it('updates the document title from the canonical Arabic route label', () => {
    renderBreadcrumbsAt('/catalog/categories')

    expect(document.title).toBe('EIAMS — التصنيفات')
  })

  it('renders the Arabic trail with separator and active last item', () => {
    renderBreadcrumbsAt('/catalog/categories')

    const nav = screen.getByRole('navigation', { name: 'مسار التنقل' })
    expect(nav).toHaveTextContent('لوحة المعلومات')
    expect(nav).toHaveTextContent('مجالات التصنيف')
    expect(screen.getByRole('link', { name: 'لوحة المعلومات' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'مجالات التصنيف' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'التصنيفات' })).not.toBeInTheDocument()
    expect(screen.getByText('التصنيفات')).toHaveAttribute('aria-current', 'page')
    expect(nav.querySelectorAll('li > span[aria-hidden]')).toHaveLength(2)
  })

  it('renders nothing on unlisted URLs instead of linking to nowhere', () => {
    renderBreadcrumbsAt('/unknown/path')

    expect(screen.queryByRole('navigation', { name: 'مسار التنقل' })).not.toBeInTheDocument()
  })

  it('navigates through parent links', async () => {
    const user = userEvent.setup()
    renderBreadcrumbsAt('/documents/receiving/9')

    const receivingLink = screen.getByRole('link', { name: 'سندات الاستلام' })
    await user.click(receivingLink)

    expect(screen.getByText('سندات الاستلام')).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'سندات الاستلام' })).not.toBeInTheDocument()
  })
})
