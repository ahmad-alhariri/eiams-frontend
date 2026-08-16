import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bootstrapApplication } from '@/app/boot'

const envState = vi.hoisted(() => ({
  environment: {
    isDevelopment: true,
    enableApiMocks: true,
  },
}))

vi.mock('@/config/env', () => ({ environment: envState.environment }))

function mountRoot(): HTMLElement {
  const rootElement = document.createElement('div')
  rootElement.id = 'root'
  document.body.appendChild(rootElement)
  return rootElement
}

describe('bootstrapApplication', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    envState.environment.isDevelopment = true
    envState.environment.enableApiMocks = true
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('starts the dev mocks and mounts the application tree', async () => {
    const rootElement = mountRoot()
    const startMocks = vi.fn().mockResolvedValue(undefined)
    const renderApp = vi.fn()

    await bootstrapApplication({ startMocks, renderApp })

    expect(startMocks).toHaveBeenCalledOnce()
    expect(renderApp).toHaveBeenCalledOnce()
    expect(renderApp).toHaveBeenCalledWith(rootElement)
  })

  it('skips the dev mocks when the flag is disabled', async () => {
    envState.environment.enableApiMocks = false
    mountRoot()
    const startMocks = vi.fn().mockResolvedValue(undefined)
    const renderApp = vi.fn()

    await bootstrapApplication({ startMocks, renderApp })

    expect(startMocks).not.toHaveBeenCalled()
    expect(renderApp).toHaveBeenCalledOnce()
  })

  it('never starts mocks outside development', async () => {
    envState.environment.isDevelopment = false
    mountRoot()
    const startMocks = vi.fn().mockResolvedValue(undefined)
    const renderApp = vi.fn()

    await bootstrapApplication({ startMocks, renderApp })

    expect(startMocks).not.toHaveBeenCalled()
    expect(renderApp).toHaveBeenCalledOnce()
  })

  it('renders the failure screen instead of a blank page when mocks fail', async () => {
    mountRoot()
    const startFailure = new Error('Service worker activation timed out')
    const startMocks = vi.fn().mockRejectedValue(startFailure)
    const renderApp = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await bootstrapApplication({ startMocks, renderApp })

    expect(renderApp).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'تعذر تشغيل التطبيق' })).toBeInTheDocument()
    })
    expect(screen.getByText(startFailure.message)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة تحميل الصفحة' })).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(
      '[bootstrap] The application failed to start.',
      startFailure,
    )
  })

  it('logs clearly when the root element is missing', async () => {
    const startMocks = vi.fn().mockResolvedValue(undefined)
    const renderApp = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await bootstrapApplication({ startMocks, renderApp })

    expect(consoleError).toHaveBeenCalledWith('[bootstrap] Root element #root was not found.')
    expect(startMocks).not.toHaveBeenCalled()
    expect(renderApp).not.toHaveBeenCalled()
  })
})
