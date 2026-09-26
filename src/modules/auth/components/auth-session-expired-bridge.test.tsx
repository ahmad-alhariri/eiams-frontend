import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router'

import { AuthSessionExpiredBridge } from '@/modules/auth/components/auth-session-expired-bridge'

const mockNavigate = vi.fn()
const mockSubscribe = vi.fn()
const sessionAdapter = { subscribe: mockSubscribe }

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: actual.useLocation,
  }
})

vi.mock('@/shared/services/api.client', () => ({
  sessionAdapter: { subscribe: (...args: unknown[]) => sessionAdapter.subscribe(...args) },
}))

type Listener = (
  event: { type: 'session-refreshed'; session: unknown } | { type: 'session-expired' },
) => void

let latestListener: Listener | null = null
let unsubscribeCalls = 0

beforeEach(() => {
  mockNavigate.mockReset()
  mockSubscribe.mockReset()
  latestListener = null
  unsubscribeCalls = 0
  sessionAdapter.subscribe = mockSubscribe.mockImplementation((listener: Listener) => {
    latestListener = listener
    return () => {
      unsubscribeCalls += 1
      latestListener = null
    }
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

function LocationProbe({ children }: { children: React.ReactNode }) {
  // Mirrors the router so `useLocation` has a context; the bridge itself
  // does not read it, but it would TypeError without a router ancestor.
  void useLocation
  return <>{children}</>
}

describe('AuthSessionExpiredBridge (D-AUTH-01 session-expired navigation)', () => {
  it('subscribes to the session adapter exactly once on mount', () => {
    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <LocationProbe>
          <AuthSessionExpiredBridge />
        </LocationProbe>
      </MemoryRouter>,
    )

    expect(mockSubscribe).toHaveBeenCalledTimes(1)
    expect(latestListener).not.toBeNull()
  })

  it('navigates to /login with replace=true when the adapter publishes session-expired', () => {
    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <LocationProbe>
          <AuthSessionExpiredBridge />
        </LocationProbe>
      </MemoryRouter>,
    )

    expect(latestListener).not.toBeNull()
    act(() => {
      latestListener!({ type: 'session-expired' })
    })

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('ignores non-expired events (e.g. session-refreshed)', () => {
    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <LocationProbe>
          <AuthSessionExpiredBridge />
        </LocationProbe>
      </MemoryRouter>,
    )

    expect(latestListener).not.toBeNull()
    act(() => {
      latestListener!({
        type: 'session-refreshed',
        session: { user: { userId: 'u' } },
      })
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('unsubscribes on unmount so the listener count returns to zero', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/inventory']}>
        <LocationProbe>
          <AuthSessionExpiredBridge />
        </LocationProbe>
      </MemoryRouter>,
    )

    expect(mockSubscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribeCalls).toBe(0)

    unmount()

    expect(unsubscribeCalls).toBe(1)
    expect(latestListener).toBeNull()
  })
})
