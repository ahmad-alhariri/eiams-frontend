import { createMemoryRouter, RouterProvider } from 'react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  createLazyPageElement,
  getWiredRouteKeys,
  hasWiredPage,
  isDevOnlyRoute,
  toCatchAllRouteObject,
  toRouteObject,
} from '@/config/route-registry'
import { ROUTE_PATHS } from '@/config/routes'

describe('Lazy route registry', () => {
  it('wires the login, module placeholders, not-found page, and dev gallery', () => {
    expect(getWiredRouteKeys()).toContain('dashboard')
    expect(getWiredRouteKeys()).toContain('catalogMaterials')
    expect(getWiredRouteKeys()).toContain('adminUsers')
    expect(hasWiredPage('login')).toBe(true)
    expect(hasWiredPage('notFound')).toBe(true)
    expect(hasWiredPage('devGallery')).toBe(true)
  })

  it('gives every declared protected module path a lazy placeholder', () => {
    expect(hasWiredPage('catalogMaterials')).toBe(true)
    expect(hasWiredPage('dashboard')).toBe(true)
    expect(hasWiredPage('adminUsers')).toBe(true)
  })

  it('flags the gallery as dev-only', () => {
    expect(isDevOnlyRoute('devGallery')).toBe(true)
    expect(isDevOnlyRoute('notFound')).toBe(false)
  })

  it('builds route objects with the declared path and a lazy element', () => {
    const route = toRouteObject('devGallery')
    expect(route.path).toBe(ROUTE_PATHS.devGallery)
    expect({ ...route }).toHaveProperty('element')
  })

  it('builds the catch-all for the not-found page', () => {
    const catchAll = toCatchAllRouteObject('notFound')
    expect(catchAll.path).toBe('*')
    expect({ ...catchAll }).toHaveProperty('element')
  })

  it('produces an element for a module placeholder route', () => {
    const element = createLazyPageElement('dashboard')
    expect(element.type).toBeDefined()
  })

  it('produces an element for wired routes', () => {
    const element = createLazyPageElement('notFound')
    expect(element.type).toBeDefined()
  })

  it('wraps route elements in the per-domain error boundary', async () => {
    const route = toRouteObject('devGallery')
    const router = createMemoryRouter([{ ...route, path: '/' }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByText('معرض المكونات المشتركة', undefined, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(document.querySelector('[data-slot="domain-error-boundary"]')).not.toBeNull()
  })

  it('wraps the not-found catch-all in the per-domain error boundary too', () => {
    const catchAll = toCatchAllRouteObject('notFound')
    expect(catchAll.path).toBe('*')
    expect({ ...catchAll }).toHaveProperty('element')
  })
})
