import axios, {
  AxiosHeaders,
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'

import { environment } from '@/config/env'
import { createSessionAdapter, type SessionAdapter } from '@/shared/services/session-adapter'
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

/**
 * Creates one credentialed Axios transport with an attached session boundary.
 * The factory keeps interceptor lifecycle explicit for isolated tests and
 * non-browser consumers; application code uses the singletons below.
 */
export function createApiClient({ baseURL }: CreateApiClientOptions): ApiClientBundle {
  const client = axios.create({
    baseURL,
    withCredentials: true,
  })

  const sessionAdapter = createSessionAdapter(async () => {
    const response = await client.post<AuthTokenResponse>(AUTH_REFRESH_PATH)
    return response.data
  })

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
    (response) => response,
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

const sharedApiClient = createApiClient({ baseURL: environment.apiBaseUrl })

export const apiClient = sharedApiClient.client
export const sessionAdapter = sharedApiClient.sessionAdapter
