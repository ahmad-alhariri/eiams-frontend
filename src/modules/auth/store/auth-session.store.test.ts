import { describe, expect, it, vi } from 'vitest'

import { createAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import type {
  SessionAdapter,
  SessionAdapterEvent,
  SessionAdapterListener,
} from '@/shared/services/session-adapter'
import type { AuthTokenResponse, SessionResponse } from '@/shared/types/generated/eiams-v1'

const sessionFixture: SessionResponse = {
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    username: 'warehouse.keeper',
    displayName: 'أمين المستودع',
    status: 'Active',
    rowVersion: 1,
  },
  permissionCodes: ['document.create'],
  availableScopes: [],
  scopeState: 'SelectionRequired',
  activeRoles: [],
}

const tokenResponse: AuthTokenResponse = {
  accessToken: 'memory-only-token',
  expiresInSeconds: 300,
  session: sessionFixture,
  tokenType: 'Bearer',
}

function createSessionAdapterStub() {
  const listeners = new Set<SessionAdapterListener>()
  const adapter: SessionAdapter = {
    applyAuthorizationHeader: vi.fn(),
    installTokenResponse: vi.fn(() => sessionFixture),
    clearAccessToken: vi.fn(),
    refreshSession: vi.fn(async () => sessionFixture),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  return {
    adapter,
    emit(event: SessionAdapterEvent) {
      for (const listener of listeners) {
        listener(event)
      }
    },
  }
}

describe('auth session store', () => {
  it('starts in an initializing state without copying server session data', () => {
    const { adapter } = createSessionAdapterStub()
    const store = createAuthSessionStore(adapter)

    expect(store.getState()).toMatchObject({ status: 'initializing' })
    expect(store.getState()).not.toHaveProperty('session')
    expect(store.getState()).not.toHaveProperty('user')
    expect(store.getState()).not.toHaveProperty('permissionCodes')
  })

  it('installs a successful login only through the credential adapter', () => {
    const { adapter } = createSessionAdapterStub()
    const store = createAuthSessionStore(adapter)

    store.getState().installLogin(tokenResponse)

    expect(adapter.installTokenResponse).toHaveBeenCalledWith(tokenResponse)
    expect(store.getState().status).toBe('authenticated')
  })

  it('updates UI lifecycle state from adapter refresh and expiry events', () => {
    const { adapter, emit } = createSessionAdapterStub()
    const store = createAuthSessionStore(adapter)

    emit({ type: 'session-refreshed', session: sessionFixture })
    expect(store.getState().status).toBe('authenticated')

    emit({ type: 'session-expired' })
    expect(adapter.clearAccessToken).not.toHaveBeenCalled()
    expect(store.getState().status).toBe('unauthenticated')
  })

  it('clears the adapter-owned token when the lifecycle explicitly ends', () => {
    const { adapter } = createSessionAdapterStub()
    const store = createAuthSessionStore(adapter)

    store.getState().clearSession()

    expect(adapter.clearAccessToken).toHaveBeenCalledTimes(1)
    expect(store.getState().status).toBe('unauthenticated')
  })
})
