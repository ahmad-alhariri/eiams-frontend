import type { QueryClient, QueryKey } from '@tanstack/react-query'

export type ScopeCacheKey =
  { kind: 'enterprise' } | { kind: 'site'; id: string } | { kind: 'warehouse'; id: string }

const SCOPED_PREFIX = 'scoped'
const PUBLIC_PREFIX = 'public'

function scopeParts(scope: ScopeCacheKey) {
  return [scope.kind, 'id' in scope ? scope.id : null] as const
}

export const queryKeys = {
  public: (resource: string, ...parts: readonly unknown[]) =>
    [PUBLIC_PREFIX, resource, ...parts] as const,
  scoped: (scope: ScopeCacheKey, resource: string, ...parts: readonly unknown[]) =>
    [SCOPED_PREFIX, ...scopeParts(scope), resource, ...parts] as const,
}

function matchesScope(queryKey: QueryKey, scope: ScopeCacheKey) {
  const [prefix, kind, id] = queryKey
  const [scopeKind, scopeId] = scopeParts(scope)
  return prefix === SCOPED_PREFIX && kind === scopeKind && id === scopeId
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
