import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

/** A single search-param patch; `null` removes the key entirely. */
export type QueryParamValue = string | number | boolean | null

export type QueryParamPatch = Readonly<Record<string, QueryParamValue>>

export interface QueryParamHelpers {
  /** Raw URLSearchParams of the current location. */
  searchParams: URLSearchParams
  getString: (name: string, fallback?: string) => string
  getNumber: (name: string, fallback?: number) => number
  getBoolean: (name: string, fallback?: boolean) => boolean
  /** Applies a patch; pass `null` to delete a key. */
  setParams: (patch: QueryParamPatch, options?: { replace?: boolean }) => void
}

function serialize(value: QueryParamValue) {
  if (value === null || value === undefined) {
    return null
  }
  return String(value)
}

/**
 * Typed read/write access to the URL search params (page, pageSize, filters,
 * search text). List pages own their filter state in the URL so deep links
 * and the browser back button keep working; this hook is the only place that
 * reads or writes the query string for that purpose.
 */
export function useQueryParams(): QueryParamHelpers {
  const [searchParams, setSearchParams] = useSearchParams()

  const getString = useCallback(
    (name: string, fallback?: string) => searchParams.get(name) ?? fallback ?? '',
    [searchParams],
  )

  const getNumber = useCallback(
    (name: string, fallback?: number) => {
      const raw = searchParams.get(name)
      if (raw === null || raw === '') {
        return fallback ?? 0
      }
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : (fallback ?? 0)
    },
    [searchParams],
  )

  const getBoolean = useCallback(
    (name: string, fallback?: boolean) => {
      const raw = searchParams.get(name)
      if (raw === null) {
        return fallback ?? false
      }
      return raw === 'true' || raw === '1'
    },
    [searchParams],
  )

  const setParams = useCallback(
    (patch: QueryParamPatch, options?: { replace?: boolean }) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [name, value] of Object.entries(patch)) {
            const serialized = serialize(value)
            if (serialized === null) {
              next.delete(name)
            } else {
              next.set(name, serialized)
            }
          }
          return next
        },
        options?.replace === undefined ? undefined : { replace: options.replace },
      )
    },
    [setSearchParams],
  )

  return useMemo(
    () => ({ searchParams, getString, getNumber, getBoolean, setParams }),
    [searchParams, getString, getNumber, getBoolean, setParams],
  )
}
