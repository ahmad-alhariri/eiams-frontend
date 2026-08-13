import { useCallback } from 'react'

import type { AsyncSelectOption } from '@/shared/ui/async-select'

/** An AsyncSelect-compatible option, re-exported under the selector domain name. */
export type SelectorOption<TEntity> = AsyncSelectOption<TEntity>

/** Loads raw entities for a search query (injected by the caller; no HTTP here). */
export type EntityLoader<TEntity> = (query: string) => Promise<TEntity[]>

/** A function that turns a search query into AsyncSelect options. */
export type OptionLoader<TEntity> = (query: string) => Promise<SelectorOption<TEntity>[]>

/**
 * Maps a contract entity to its AsyncSelect option representation.
 *
 * `toOption` carries the full entity in `payload` so renderers can show hints
 * (code, job title, location, ...) without extra lookups. `searchLabel` feeds
 * client-side prefiltering for the "scope loaded once" pattern
 * (see {@link filterEntitiesBySearchLabel}).
 */
export interface EntitySelectorAdapter<TEntity> {
  toOption(entity: TEntity): SelectorOption<TEntity>
  toOptionLabel(entity: TEntity): string
  searchLabel(entity: TEntity): string
}

/** Input of {@link createEntitySelectorAdapter}; only `toOption` is required. */
export interface EntitySelectorAdapterOptions<TEntity> {
  toOption(entity: TEntity): SelectorOption<TEntity>
  toOptionLabel?(entity: TEntity): string
  searchLabel?(entity: TEntity): string
}

/**
 * Creates an {@link EntitySelectorAdapter} from a minimal mapping.
 * `toOptionLabel` defaults to the mapped option's label and `searchLabel`
 * defaults to `toOptionLabel`.
 */
export function createEntitySelectorAdapter<TEntity>(
  options: EntitySelectorAdapterOptions<TEntity>,
): EntitySelectorAdapter<TEntity> {
  const { toOption, toOptionLabel, searchLabel } = options
  const labelOf = toOptionLabel ?? ((entity: TEntity) => toOption(entity).label)
  return {
    toOption,
    toOptionLabel: labelOf,
    searchLabel: searchLabel ?? labelOf,
  }
}

/**
 * Normalizes a raw option list: options with empty (whitespace-only) labels are
 * skipped, duplicates by `option.value` keep their first occurrence, and the
 * result is sliced to `maxResults`.
 */
export function normalizeSelectorOptions<TEntity>(
  options: readonly SelectorOption<TEntity>[],
  maxResults = 10,
): SelectorOption<TEntity>[] {
  const seen = new Set<string>()
  const filtered = options.filter((option) => {
    if (option.label.trim() === '') {
      return false
    }
    if (seen.has(option.value)) {
      return false
    }
    seen.add(option.value)
    return true
  })
  return filtered.slice(0, Math.max(0, maxResults))
}

/**
 * Client-side filtering of options by their label, used when the loader
 * already returns everything and search is local (the "scope loaded once"
 * pattern). Empty or whitespace queries return all options unchanged.
 */
export function filterOptionsByLabel<TEntity>(
  options: readonly SelectorOption<TEntity>[],
  query: string,
): SelectorOption<TEntity>[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') {
    return [...options]
  }
  return options.filter((option) => option.label.toLocaleLowerCase().includes(needle))
}

/**
 * Client-side prefiltering of raw entities by {@link EntitySelectorAdapter.searchLabel},
 * used when the scope entities are already fetched once and the search stays local.
 */
export function filterEntitiesBySearchLabel<TEntity>(
  adapter: EntitySelectorAdapter<TEntity>,
  entities: readonly TEntity[],
  query: string,
): TEntity[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') {
    return [...entities]
  }
  return entities.filter((entity) =>
    adapter.searchLabel(entity).toLocaleLowerCase().includes(needle),
  )
}

/**
 * Turns an entity loader into an AsyncSelect-compatible option loader.
 * Results are mapped through `adapter`, normalized (dedupe by value, empty
 * labels skipped) and sliced to `maxResults` (default 10, matching AsyncSelect).
 * The returned loader is memoized so it stays referentially stable as long as
 * `adapter` and the injected loader do.
 */
export function useScopedEntityOptions<TEntity>(
  adapter: EntitySelectorAdapter<TEntity>,
  loader: EntityLoader<TEntity>,
  maxResults = 10,
): OptionLoader<TEntity> {
  return useCallback(
    async (query: string) => {
      const entities = await loader(query)
      return normalizeSelectorOptions(
        entities.map((entity) => adapter.toOption(entity)),
        maxResults,
      )
    },
    [adapter, loader, maxResults],
  )
}

/** Result of a built-in entity selector hook. */
export interface EntitySelectorResult<TEntity> {
  /** Entity → option mapping, exposed for local mapping of an already-loaded scope. */
  options: EntitySelectorAdapter<TEntity>
  /** AsyncSelect-compatible query loader built from the injected loader. */
  loadOptions: OptionLoader<TEntity>
}
