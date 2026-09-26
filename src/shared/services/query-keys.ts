import type { QueryClient, QueryKey } from '@tanstack/react-query'

export type ScopeCacheKey =
  { kind: 'enterprise' } | { kind: 'site'; id: string } | { kind: 'warehouse'; id: string }

const SCOPED_PREFIX = 'scoped'
const PUBLIC_PREFIX = 'public'

function scopeParts(scope: ScopeCacheKey) {
  return [scope.kind, 'id' in scope ? scope.id : null] as const
}

/**
 * Canonical query key factory.
 *
 * All feature hooks MUST use this factory (directly or through a module key
 * helper) so that equivalent requests share stable keys regardless of where
 * they are declared. Two callers that pass the same scope, resource, and
 * variable parts receive the same query key reference.
 *
 * Keys are tuples so React Query can normalize them structurally. Filters and
 * other objects are spread as tuple elements so that different filter values
 * produce different keys while equivalent filter objects produce equivalent
 * keys (the factory does NOT serialize to strings — callers pass plain objects
 * that React Query deep-compares by reference; the caller is responsible for
 * stable filter object identity within a component render cycle).
 */
export const queryKeys = {
  /**
   * Public (unscoped) resource keys.
   *
   * Used for data that is not authorization-scoped, or for modules that opt
   * out of scope isolation. Prefer scoped keys for protected resources.
   */
  public: (resource: string, ...parts: readonly unknown[]) =>
    [PUBLIC_PREFIX, resource, ...parts] as const,

  /**
   * Scoped resource keys that include the active authorization scope.
   *
   * The scope prefix guarantees that data fetched under one scope is never
   * reused for a different scope. Warehouse-specific balances, for example,
   * cannot leak from one warehouse into another.
   */
  scoped: (scope: ScopeCacheKey, resource: string, ...parts: readonly unknown[]) =>
    [SCOPED_PREFIX, ...scopeParts(scope), resource, ...parts] as const,

  /**
   * Scope identity only — used by helpers that need the scope prefix without
   * a named resource.
   */
  scopeOnly: (scope: ScopeCacheKey) => [SCOPED_PREFIX, ...scopeParts(scope)] as const,
}

/**
 * Matches a query key that belongs to one specific scope.
 *
 * Used by invalidation helpers that must NOT touch other scopes.
 */
function matchesScope(queryKey: QueryKey, scope: ScopeCacheKey) {
  const [prefix, kind, id] = queryKey
  const [scopeKind, scopeId] = scopeParts(scope)
  return prefix === SCOPED_PREFIX && kind === scopeKind && id === scopeId
}

/**
 * Matches a query key that starts with a given prefix tuple.
 *
 * Used by invalidation helpers that target a resource tree (for example,
 * every key under `['scoped', 'warehouse', 'wh-1', 'inventory']`).
 */
function matchesPrefix(queryKey: QueryKey, prefix: readonly unknown[]): boolean {
  if (queryKey.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (queryKey[i] !== prefix[i]) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Invalidation helpers
// ---------------------------------------------------------------------------

/** Invalidates all cached server data belonging to one active scope. */
export function invalidateScopedQueries(client: QueryClient, scope: ScopeCacheKey) {
  return client.invalidateQueries({ predicate: (query) => matchesScope(query.queryKey, scope) })
}

/**
 * Invalidates every query whose key starts with a resource prefix.
 *
 * Use this when a mutation changes a resource in ways that affect multiple
 * list/detail variants under the same scope. For example, creating a warehouse
 * document invalidates the document list (all filter variants) but not the
 * document detail, history, or policy of unrelated documents.
 *
 * @param client The query client.
 * @param scope The active scope.
 * @param resource The resource name, for example `'document'` or `'inventory'`.
 * @param furtherParts Additional fixed segments to narrow the tree. Pass `[]` or
 *   omit to target all keys under `resource`.
 */
export function invalidateResourceTree(
  client: QueryClient,
  scope: ScopeCacheKey,
  resource: string,
  furtherParts: readonly unknown[] = [],
) {
  const prefix = [SCOPED_PREFIX, ...scopeParts(scope), resource, ...furtherParts] as const
  return client.invalidateQueries({
    predicate: (query) => matchesPrefix(query.queryKey, prefix),
  })
}

/**
 * Invalidates a specific resource instance and everything under it.
 *
 * Example: after updating warehouse `wh-1`, invalidate
 * `['scoped', 'warehouse', 'wh-1', 'warehouses', 'wh-1', ...]` so the detail
 * and every sub-resource (capabilities, material-settings) refetch.
 */
export function invalidateResourceInstance(
  client: QueryClient,
  scope: ScopeCacheKey,
  resource: string,
  instanceId: string,
  furtherParts: readonly unknown[] = [],
) {
  return invalidateResourceTree(client, scope, resource, [instanceId, ...furtherParts])
}

/**
 * Invalidates every list query for a resource under a scope.
 *
 * List queries carry variable filter/sort/pagination objects as trailing parts,
 * so a predicate that matches the static prefix (scope + resource + list name)
 * followed by an object trailing part is the safest way to invalidate all list
 * variants without also invalidating detail or sub-resource keys.
 */
export function invalidateResourceLists(
  client: QueryClient,
  scope: ScopeCacheKey,
  resource: string,
  listName: string,
) {
  const prefix = [SCOPED_PREFIX, ...scopeParts(scope), resource, listName] as const
  return client.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey
      if (!matchesPrefix(key, prefix)) return false
      // Trailing object = list variant (filters/pagination). Scalar trailing
      // parts (instance id, sub-resource name) belong to detail/sub-resource
      // keys, not lists.
      const trailing = key.slice(prefix.length)
      return trailing.length > 0 && typeof trailing[0] === 'object' && trailing[0] !== null
    },
  })
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

/**
 * Removes session-derived and scope-bound data while retaining explicitly
 * public reference data.
 */
export function removeProtectedQueries(client: QueryClient) {
  return client.removeQueries({
    predicate: (query) =>
      query.queryKey[0] === SCOPED_PREFIX || query.queryKey[0] === 'auth',
  })
}

/**
 * Cancels and removes session-derived and scope-bound data.
 */
export async function clearProtectedQueries(client: QueryClient): Promise<void> {
  const queryFilter = {
    predicate: (query: { queryKey: QueryKey }) =>
      query.queryKey[0] === SCOPED_PREFIX || query.queryKey[0] === 'auth',
  }

  try {
    await client.cancelQueries(queryFilter)
  } finally {
    client.removeQueries(queryFilter)
  }
}
