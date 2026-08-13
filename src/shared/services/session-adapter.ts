import type { AuthTokenResponse, SessionResponse } from '@/shared/types/generated/eiams-v1'

export type SessionAdapterEvent =
  | Readonly<{
      type: 'session-refreshed'
      session: SessionResponse
    }>
  | Readonly<{
      type: 'session-expired'
    }>

export type SessionAdapterListener = (event: SessionAdapterEvent) => void

export type RefreshSessionRequest = () => Promise<AuthTokenResponse>

export interface AuthorizationHeaderTarget {
  set: (name: 'Authorization', value: string) => void
  delete: (name: 'Authorization') => void
}

export interface SessionAdapter {
  applyAuthorizationHeader: (headers: AuthorizationHeaderTarget) => void
  installTokenResponse: (response: AuthTokenResponse) => SessionResponse
  clearAccessToken: () => void
  refreshSession: () => Promise<SessionResponse>
  subscribe: (listener: SessionAdapterListener) => () => void
}

/**
 * Owns the access credential for one browser runtime.
 *
 * The token deliberately lives only in this closure. Consumers can install a
 * contract response after login, apply it to transport, or clear it on logout;
 * no persistence or framework state is involved.
 */
export function createSessionAdapter(refreshRequest: RefreshSessionRequest): SessionAdapter {
  let accessToken: AuthTokenResponse['accessToken'] | null = null
  let refreshInFlight: Promise<SessionResponse> | null = null
  const listeners = new Set<SessionAdapterListener>()

  const publish = (event: SessionAdapterEvent) => {
    for (const listener of [...listeners]) {
      try {
        listener(event)
      } catch {
        // Integration observers must not replace the transport's Axios result.
      }
    }
  }

  const installTokenResponse = (response: AuthTokenResponse) => {
    accessToken = response.accessToken
    return response.session
  }

  const refreshSession = () => {
    if (refreshInFlight) {
      return refreshInFlight
    }

    const request = Promise.resolve().then(refreshRequest)
    const settledRequest = request.then(
      (response) => {
        const session = installTokenResponse(response)
        publish({ type: 'session-refreshed', session })
        return session
      },
      (error: unknown) => {
        accessToken = null
        publish({ type: 'session-expired' })
        throw error
      },
    )

    refreshInFlight = settledRequest.finally(() => {
      refreshInFlight = null
    })

    return refreshInFlight
  }

  return {
    applyAuthorizationHeader: (headers) => {
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`)
      } else {
        headers.delete('Authorization')
      }
    },
    installTokenResponse,
    clearAccessToken: () => {
      accessToken = null
    },
    refreshSession,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
