import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'

import { environment } from '@/config/env'
import { createDevSession, isDevAuthBypassEnabled } from '@/shared/services/dev-session'
import {
  createSessionAdapter,
  type RefreshSessionRequest,
  type SessionAdapter,
} from '@/shared/services/session-adapter'
import type { AuthTokenResponse, paths } from '@/shared/types/generated/eiams-v1'

const AUTH_LOGIN_PATH = '/auth/login' satisfies keyof paths
const AUTH_REFRESH_PATH = '/auth/refresh' satisfies keyof paths

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _eiamsAuthRetry?: true
}

export interface ApiClientBundle {
  client: AxiosInstance
  sessionAdapter: SessionAdapter
  dispose: () => void
}

export interface CreateApiClientOptions {
  baseURL: string
  /** Optional refresh override — the dev session fixture takes this slot. */
  refreshSession?: RefreshSessionRequest
}

function requestPath(url: string | undefined): string {
  if (!url) {
    return ''
  }

  try {
    return new URL(url, 'http://eiams.invalid').pathname
  } catch {
    return url.split(/[?#]/u, 1)[0] ?? ''
  }
}

function pathEndsWith(url: string | undefined, endpoint: keyof paths): boolean {
  return requestPath(url).endsWith(endpoint)
}

function isRefreshExcluded(url: string | undefined): boolean {
  return pathEndsWith(url, AUTH_LOGIN_PATH) || pathEndsWith(url, AUTH_REFRESH_PATH)
}

function headersFor(config: InternalAxiosRequestConfig): AxiosHeaders {
  if (config.headers instanceof AxiosHeaders) {
    return config.headers
  }

  return AxiosHeaders.from(config.headers)
}

function isEligibleUnauthorized(error: AxiosError): error is AxiosError & {
  config: RetriableRequestConfig
} {
  const config = error.config as RetriableRequestConfig | undefined

  return (
    error.response?.status === 401 &&
    config !== undefined &&
    config._eiamsAuthRetry !== true &&
    !isRefreshExcluded(config.url)
  )
}

const GATEWAY_PROBLEM = {
  code: 'gateway.unexpected_response',
  detailAr: 'لم تُرجع الخدمة البيانات المتوقعة. تحقق من إعدادات الخادم ثم أعد المحاولة.',
  fieldErrors: [],
  status: 502,
  titleAr: 'استجابة الخدمة غير صالحة.',
  traceId: `gateway-${Date.now()}`,
  type: 'https://eiams.example/problems/gateway.unexpected_response',
} as const

/**
 * Guards the JSON transport boundary against non-JSON responses.
 *
 * When an origin-relative path has no backend (or a proxy misroutes), the SPA
 * fallback can answer `200 text/html`. Axios then hands the pages an HTML
 * string, which surfaces as cryptic `map is not a function` / `undefined.id`
 * crashes. Rejecting such responses as an explicit 502 lets the standard error
 * normalization produce the Arabic error state with a retry action instead.
 */
function isUnexpectedTextResponse(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
): boolean {
  if (status === 204) {
    return false
  }

  const responseType = config.responseType ?? 'json'
  return responseType === 'json' && typeof data === 'string' && data.length > 0
}

function nonJsonResponseError(config: InternalAxiosRequestConfig): AxiosError {
  const response: AxiosResponse = {
    config,
    data: GATEWAY_PROBLEM,
    headers: AxiosHeaders.from(config.headers),
    status: 502,
    statusText: 'Bad Gateway',
  }
  return new AxiosError(
    'The server returned a non-JSON response',
    'ERR_BAD_RESPONSE',
    config,
    undefined,
    response,
  )
}

/**
 * Creates one credentialed Axios transport with an attached session boundary.
 * The factory keeps interceptor lifecycle explicit for isolated tests and
 * non-browser consumers; application code uses the singletons below.
 */
export function createApiClient({
  baseURL,
  refreshSession,
}: CreateApiClientOptions): ApiClientBundle {
  const client = axios.create({
    baseURL,
    withCredentials: true,
  })

  const sessionAdapter = createSessionAdapter(
    refreshSession ??
      (async () => {
        const response = await client.post<AuthTokenResponse>(AUTH_REFRESH_PATH)
        return response.data
      }),
  )

  const requestInterceptor = client.interceptors.request.use((config) => {
    const headers = headersFor(config)

    config.withCredentials = true
    config.headers = headers

    if (!isRefreshExcluded(config.url)) {
      sessionAdapter.applyAuthorizationHeader(headers)
    } else {
      headers.delete('Authorization')
    }

    return config
  })

  const responseInterceptor = client.interceptors.response.use(
    (response) => {
      if (isUnexpectedTextResponse(response.config, response.status, response.data)) {
        return Promise.reject(nonJsonResponseError(response.config))
      }

      return response
    },
    async (error: unknown) => {
      if (!axios.isAxiosError(error) || !isEligibleUnauthorized(error)) {
        throw error
      }

      error.config._eiamsAuthRetry = true
      await sessionAdapter.refreshSession()
      return client.request(error.config)
    },
  )

  return {
    client,
    sessionAdapter,
    dispose: () => {
      client.interceptors.request.eject(requestInterceptor)
      client.interceptors.response.eject(responseInterceptor)
    },
  }
}

const useDevSession = isDevAuthBypassEnabled(environment, import.meta.env)

if (useDevSession) {
  console.info('[dev] Auth bypass active — /auth/refresh is served by a fixture session')
}

const sharedApiClient = createApiClient(
  useDevSession
    ? { baseURL: environment.apiBaseUrl, refreshSession: async () => createDevSession() }
    : { baseURL: environment.apiBaseUrl },
)

export const apiClient = sharedApiClient.client
export const sessionAdapter = sharedApiClient.sessionAdapter
