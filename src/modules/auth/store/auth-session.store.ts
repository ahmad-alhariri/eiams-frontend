import { create, type UseBoundStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'

import { sessionAdapter } from '@/shared/services/api.client'
import type { SessionAdapter } from '@/shared/services/session-adapter'
import type { AuthTokenResponse } from '@/shared/types/generated/eiams-v1'

/**
 * Lifecycle state for the application shell and route guards.
 *
 * The server-authored user, roles, scopes, and permissions intentionally do
 * not live here. Consumers obtain that data through TanStack Query from the
 * session endpoint, while the credential remains encapsulated by
 * `SessionAdapter`.
 */
export type AuthSessionStatus = 'initializing' | 'authenticated' | 'unauthenticated'

export interface AuthSessionState {
  status: AuthSessionStatus
  installLogin: (response: AuthTokenResponse) => void
  markAuthenticated: () => void
  clearSession: () => void
}

export type AuthSessionStore = UseBoundStore<StoreApi<AuthSessionState>>

/**
 * Creates the minimal client-side auth lifecycle boundary for a session adapter.
 * The initial state waits for the hydration flow to determine whether a
 * refresh-cookie-backed session exists.
 */
export function createAuthSessionStore(adapter: SessionAdapter): AuthSessionStore {
  const store = create<AuthSessionState>((set) => ({
    status: 'initializing',
    installLogin: (response) => {
      adapter.installTokenResponse(response)
      set({ status: 'authenticated' })
    },
    markAuthenticated: () => set({ status: 'authenticated' }),
    clearSession: () => {
      adapter.clearAccessToken()
      set({ status: 'unauthenticated' })
    },
  }))

  adapter.subscribe((event) => {
    if (event.type === 'session-refreshed') {
      store.getState().markAuthenticated()
      return
    }

    // The adapter has already removed its credential before it announces expiry.
    store.setState({ status: 'unauthenticated' })
  })

  return store
}

export const useAuthSessionStore = createAuthSessionStore(sessionAdapter)
