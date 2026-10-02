import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bootstrapApplication } from '@/app/boot'

function mountRoot(): HTMLElement {
  const rootElement = document.createElement('div')
  rootElement.id = 'root'
  document.body.appendChild(rootElement)
  return rootElement
}

describe('bootstrapApplication', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('mounts the application tree', async () => {
    const rootElement = mountRoot()
    const renderApp = vi.fn()

    await bootstrapApplication({ renderApp })

    expect(renderApp).toHaveBeenCalledOnce()
    expect(renderApp).toHaveBeenCalledWith(rootElement)
  })

  it('starts no fixture layer before rendering', async () => {
    // `eiams-frontend-m4jm` deleted `src/mocks/` and the `startMocks` seam with
    // it. The remaining regression risk is someone re-adding an MSW service
    // worker start to the app bootstrap — a fixture able to answer a real
    // request — so this asserts the absence behaviourally rather than trusting
    // the comment in `boot.tsx`. jsdom ships no `navigator.serviceWorker`, so
    // the stub has to be installed for a call to even be observable.
    const register = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    })
    const rootElement = mountRoot()
    const renderApp = vi.fn()

    await bootstrapApplication({ renderApp })

    expect(register).not.toHaveBeenCalled()
    expect(renderApp).toHaveBeenCalledOnce()
    expect(renderApp).toHaveBeenCalledWith(rootElement)

    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('renders the failure screen instead of a blank page when mounting fails', async () => {
    mountRoot()
    const startFailure = new Error('Root render threw')
    const renderApp = vi.fn().mockImplementation(() => {
      throw startFailure
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await bootstrapApplication({ renderApp })

    expect(renderApp).toHaveBeenCalledOnce()
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
    const renderApp = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await bootstrapApplication({ renderApp })

    expect(consoleError).toHaveBeenCalledWith('[bootstrap] Root element #root was not found.')
    expect(renderApp).not.toHaveBeenCalled()
  })
})
