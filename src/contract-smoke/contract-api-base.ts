/**
 * Contract-smoke HTTP wiring.
 *
 * Everything below attaches to the app's REAL shared axios instance
 * (`apiClient`) — no second client, no bare instance, no fetch for endpoints
 * the frontend services (coverage item 5). Three external interceptors:
 *
 * 1. The shared request budget (`contract-budget.ts`) paces every request
 *    under the backend's measured rate limits.
 * 2. A 429 is retried with bounded backoff honouring `Retry-After`; a 429 is
 *    never swallowed as a pass.
 * 3. Every error response's wire code is collected for the error-copy table.
 *
 * The host rule: 127.0.0.1, NEVER localhost. The backend compares the request
 * `Origin` against its own `{Scheme}://{Host}`
 * (`RefreshTokenTransport.IsCookieOriginAllowed`), so `localhost` and
 * `127.0.0.1` are different hosts to it; on this machine `localhost` resolves
 * to `::1` and probes sent there time out and look like product defects.
 * Requests go through the same-origin Vite proxy (origin 5188), whose
 * forwarded Host matches the browser-equivalent origin.
 */
import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/shared/services/api.client'
import { readApiError } from '@/shared/api/envelope'
import { CONTRACT_429_RETRY_LIMIT, contractBudget } from './contract-budget'
import { recordWireCode } from './contract-wire-codes'

apiClient.defaults.baseURL = 'http://127.0.0.1:5188/api/v1'

type Contract429Config = InternalAxiosRequestConfig & {
  _eiamsContract429Attempt?: number
}

function describe(config: InternalAxiosRequestConfig): string {
  return `${(config.method ?? 'GET').toUpperCase()} ${String(config.url ?? '')}`
}

apiClient.interceptors.request.use(async (config) => {
  await contractBudget.acquire(String(config.url ?? ''))
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      throw error
    }
    const response = error.response
    if (response === undefined) {
      throw error
    }
    const wire = readApiError(response.data)
    if (wire !== null && error.config !== undefined) {
      recordWireCode(wire.code, response.status, describe(error.config))
    }
    if (response.status !== 429) {
      throw error
    }
    const config = error.config as Contract429Config | undefined
    if (config === undefined) {
      throw error
    }
    const attempt = config._eiamsContract429Attempt ?? 0
    if (attempt >= CONTRACT_429_RETRY_LIMIT) {
      throw new Error(
        `CONTRACT 429 UNRECOVERED: ${describe(config)} observed status=429 body=${JSON.stringify(response.data).slice(0, 400)}`,
        { cause: error },
      )
    }
    config._eiamsContract429Attempt = attempt + 1
    await contractBudget.acquireAfter429(response.headers['retry-after'])
    return apiClient.request(config)
  },
)
