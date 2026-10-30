import type { QueryClient, QueryKey } from '@tanstack/react-query'

export type ScopeCacheKey =
  { kind: 'enterprise' } | { kind: 'site'; id: string } | { kind: 'warehouse'; id: string }

export const SCOPED_PREFIX = 'scoped'
export const UNSCOPED_PREFIX = 'unscoped'
const PUBLIC_PREFIX = 'public'

function scopeParts(scope: ScopeCacheKey) {
  return [scope.kind, 'id' in scope ? scope.id : null] as const
}

export const queryKeys = {
  public: (resource: string, ...parts: readonly unknown[]) =>
    [PUBLIC_PREFIX, resource, ...parts] as const,
  unscoped: (resource: string, ...parts: readonly unknown[]) =>
    [UNSCOPED_PREFIX, resource, ...parts] as const,
  scoped: (scope: ScopeCacheKey, resource: string, ...parts: readonly unknown[]) =>
    [SCOPED_PREFIX, ...scopeParts(scope), resource, ...parts] as const,
}

function matchesScope(queryKey: QueryKey, scope: ScopeCacheKey) {
  const [prefix, kind, id] = queryKey
  const [scopeKind, scopeId] = scopeParts(scope)
  return prefix === SCOPED_PREFIX && kind === scopeKind && id === scopeId
}

/**
 * `placeholderData` that keeps the previous page's rows ONLY while the active
 * scope is unchanged.
 *
 * `keepPreviousData` keeps the previous rows for ANY query-key change. When the
 * user switched site or warehouse, the new scope's key asked the server for its
 * rows but the table kept rendering the OLD scope's rows underneath the new
 * scope's heading — one site's inventory shown as another site's. A scoped key
 * starts with `['scoped', kind, id, ...]`, so comparing those segments is enough
 * to refuse the cross-scope placeholder and show the skeleton instead.
 *
 * The returned function stays GENERIC on the row type (like TanStack's own
 * `keepPreviousData`): a `placeholderData` callback whose parameters are typed
 * eagerly would fix the query's data type before `queryFn` is inferred.
 */
export function keepPreviousDataInSameScope(
  scope: ScopeCacheKey | undefined,
): <TData>(
  previousData: TData | undefined,
  previousQuery: { readonly queryKey: QueryKey } | undefined,
) => TData | undefined {
  return <TData>(
    previousData: TData | undefined,
    previousQuery: { readonly queryKey: QueryKey } | undefined,
  ): TData | undefined =>
    scope !== undefined &&
    previousQuery !== undefined &&
    matchesScope(previousQuery.queryKey, scope)
      ? previousData
      : undefined
}

/** Invalidates all cached server data belonging to one active scope. */
export function invalidateScopedQueries(client: QueryClient, scope: ScopeCacheKey) {
  return client.invalidateQueries({ predicate: (query) => matchesScope(query.queryKey, scope) })
}

/** Removes protected data after a scope switch or session revocation. */
export function removeScopedQueries(client: QueryClient) {
  return client.removeQueries({ predicate: (query) => query.queryKey[0] === SCOPED_PREFIX })
}

/**
 * Stops and evicts all scope-bound data before a server-approved scope change.
 *
 * The next scope receives a distinct key, but removing the former scope's
 * cache as well prevents it from being rendered during an interrupted
 * transition or re-used after a later switch.
 */
export async function clearScopedQueries(client: QueryClient): Promise<void> {
  const queryFilter = {
    predicate: (query: { queryKey: QueryKey }) => query.queryKey[0] === SCOPED_PREFIX,
  }

  try {
    await client.cancelQueries(queryFilter)
  } finally {
    client.removeQueries(queryFilter)
  }
}
