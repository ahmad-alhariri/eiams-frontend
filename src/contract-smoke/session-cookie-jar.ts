/** Cookie jar attached to the app's REAL shared axios instance (apiClient).
 * No edit to src/shared/services/api.client.ts - interceptors added externally.
 *
 * The jar is shared by every test file, so a request that must genuinely go
 * out WITHOUT the session cookie (the refresh-with-no-cookie case) has to be
 * able to opt out per request. The marker below is a plain request-config
 * property that the request interceptor honours - it is not a header, so it
 * never reaches the backend.
 */
import { apiClient } from '@/shared/services/api.client'
import type { AxiosRequestConfig } from 'axios'

/** Request-config marker that suppresses cookie injection for one request. */
export interface ContractNoCookieMarker {
  _eiamsContractNoCookie?: boolean
}

const jar = new Map<string, string>()

/* Response interceptor: capture set-cookie headers from backend */
apiClient.interceptors.response.use((res) => {
  const sc = res.headers['set-cookie']
  if (sc) {
    const arr = Array.isArray(sc) ? sc : [sc]
    for (const s of arr) {
      const [kv] = s.split(';')
      const [k, v] = (kv ?? '').split('=', 2)
      if (k && v !== undefined) jar.set(k.trim(), v.trim())
    }
  }
  return res
})

/* Request interceptor: inject Cookie header from jar */
apiClient.interceptors.request.use((cfg) => {
  const entries = Array.from(jar.entries())
  const suppressed = (cfg as ContractNoCookieMarker)._eiamsContractNoCookie === true
  if (entries.length > 0 && !suppressed) {
    const cookieHeader = entries.map(([k, v]) => `${k}=${v}`).join('; ')
    cfg.headers = cfg.headers ?? {}
    const h = cfg.headers as Record<string, string>
    h['Cookie'] = cookieHeader
  }
  return cfg
})

/**
 * Sends one request with NO session cookie, whatever the jar holds.
 *
 * Used by the refresh-with-no-cookie case, which must observe the backend's
 * unauthenticated answer rather than the answer for a borrowed cookie.
 */
export function withoutCookie(
  config: AxiosRequestConfig = {},
): AxiosRequestConfig & ContractNoCookieMarker {
  return { ...config, _eiamsContractNoCookie: true }
}

export function jarClear(): void {
  jar.clear()
}

export function jarSet(name: string, value: string): void {
  jar.set(name, value)
}

export function jarGet(name: string): string | undefined {
  return jar.get(name)
}
