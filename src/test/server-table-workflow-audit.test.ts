import { describe, expect, it } from 'vitest'

import {
  applicationSourceFiles,
  assertScannedFiles,
  readSource,
  relativeToRepo,
} from './support/source-scan'

/**
 * The large server-table workflow audit (eiams-frontend-e25-t07).
 *
 * A server-paginated table is only correct if all of these hold together:
 *
 *  - the placeholder that keeps the previous page on screen while the next
 *    one loads REFUSES a previous scope's rows (`keepPreviousData` alone keeps
 *    them, so a scope switch showed one site's rows under another site's
 *    heading);
 *  - every DataTableServer call site forwards `isFetching`, so a page change
 *    is distinguishable from a first load and from an empty result;
 *  - the shared table scrolls inside its own container, never widening the
 *    page.
 *
 * The gallery is excluded: it is a demo surface, not a workflow.
 */
const SCANNED = applicationSourceFiles().filter(
  (file) => !relativeToRepo(file).startsWith('src/app/gallery/'),
)
// Committed count of this scan's own file set (applicationSourceFiles minus src/app/gallery); must be re-pinned when application files are added or removed.
const EXPECTED_SCANNED_FILES = 394 // committed count — re-derived from `git ls-files` after staged deletions

const RAW_KEEP_PREVIOUS = /^keepPreviousData\b/u

/**
 * The VALUE of a `placeholderData` property, read BRACE-AWARE: the value may
 * continue on the next line (`placeholderData:\n  keepPreviousData`) and may
 * carry its own call, whose comma must not end the value early. The same
 * technique the older render-profile fence uses for its query options.
 */
function placeholderDataValue(source: string, from: number): string {
  let depth = 0
  let quote: string | null = null
  let end = from
  for (let index = from; index < source.length; index += 1) {
    const character = source[index]
    if (quote !== null) {
      if (character === quote && source[index - 1] !== '\\') {
        quote = null
      }
      end = index + 1
      continue
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character
      end = index + 1
      continue
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1
      end = index + 1
      continue
    }
    if (character === ')' || character === ']' || character === '}') {
      if (depth === 0) {
        break
      }
      depth -= 1
      end = index + 1
      continue
    }
    if (character === ',' && depth === 0) {
      break
    }
    end = index + 1
  }
  return source.slice(from, end).trim()
}

/** Every query that keeps previous rows must keep them for ONE scope only. */
function unscopedPlaceholderOffenders(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/placeholderData\s*:/gu)) {
    const start = match.index ?? 0
    if (!RAW_KEEP_PREVIOUS.test(placeholderDataValue(source, start + match[0].length))) {
      continue
    }
    const line = source.slice(0, start).split(/\r?\n/u).length
    found.push(`${line}: keeps the previous SCOPE rows`)
  }
  return found
}

/**
 * The opening tag of a self-closing JSX element, brace-aware: a `/>` inside a
 * prop expression (an `emptyAction` button, a nested component) must not end
 * the tag early.
 */
function openingTagOf(source: string, start: number): string {
  let depth = 0
  let quote: string | null = null
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (quote !== null) {
      if (character === quote && source[index - 1] !== '\\') {
        quote = null
      }
      continue
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
    } else if (character === '/' && source[index + 1] === '>' && depth === 0) {
      return source.slice(start, index + 2)
    }
  }
  return source.slice(start)
}

/** A server table that is fetching must SAY it is fetching. */
function missingFetchingPropOffenders(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/<DataTableServer\b/gu)) {
    const start = match.index ?? 0
    if (/\bisFetching\s*=/u.test(openingTagOf(source, start))) {
      continue
    }
    const line = source.slice(0, start).split(/\r?\n/u).length
    found.push(`${line}: <DataTableServer> does not receive isFetching`)
  }
  return found
}

function classTokens(source: string, pattern: RegExp): string[] | null {
  const match = pattern.exec(source)
  return match?.[1] === undefined ? null : match[1].split(/\s+/u)
}

/**
 * The table scrolls inside its own box. Pinned on the two shared components:
 * the scroll container must clip the width it was given (`min-w-0`,
 * `max-w-full`) and absorb the overscroll, and the server wrapper must be
 * allowed to shrink inside its page column.
 */
function scrollContainmentOffenders(repoPath: string, source: string): string[] {
  if (repoPath === 'src/shared/ui/data-table.tsx') {
    const tokens = classTokens(source, /className="([^"]*\boverflow-x-auto\b[^"]*)"/u)
    if (tokens === null) {
      return ['no horizontal scroll container']
    }
    return ['min-w-0', 'max-w-full', 'overscroll-x-contain']
      .filter((token) => !tokens.includes(token))
      .map((token) => `scroll container is missing ${token}`)
  }

  if (repoPath === 'src/shared/ui/data-table-server.tsx') {
    const tokens = classTokens(source, /data-slot="data-table-server"[^>]*cn\('([^']*)'/u)
    if (tokens === null) {
      return ['no data-table-server root']
    }
    return tokens.includes('min-w-0') ? [] : ['server table root is missing min-w-0']
  }

  return []
}

function scanRule(detector: (repoPath: string, source: string) => string[]): string[] {
  const found: string[] = []
  for (const file of SCANNED) {
    const repoPath = relativeToRepo(file)
    for (const offender of detector(repoPath, readSource(file))) {
      found.push(`${repoPath}: ${offender}`)
    }
  }
  return found
}

describe('server table workflow audit (eiams-frontend-e25-t07)', () => {
  it('scans the pinned set of production files', () => {
    assertScannedFiles(SCANNED, EXPECTED_SCANNED_FILES)
  })

  it('never keeps the previous scope rows as the new scope', () => {
    expect(scanRule((_path, source) => unscopedPlaceholderOffenders(source))).toEqual([])
  })

  it('forwards isFetching from every server table call site', () => {
    expect(scanRule((_path, source) => missingFetchingPropOffenders(source))).toEqual([])
  })

  it('keeps the table scroll inside its own container', () => {
    expect(scanRule(scrollContainmentOffenders)).toEqual([])
  })

  it('detects a raw keepPreviousData placeholder', () => {
    expect(
      unscopedPlaceholderOffenders(
        'useQuery({ placeholderData: keepPreviousData, queryKey: keys(scope) })',
      ),
    ).toHaveLength(1)
    expect(
      unscopedPlaceholderOffenders('placeholderData: keepPreviousDataInSameScope(scope),'),
    ).toHaveLength(0)
    // A placeholder broken across lines must not slip past the rule.
    expect(
      unscopedPlaceholderOffenders('useQuery({\n  placeholderData:\n    keepPreviousData,\n})'),
    ).toHaveLength(1)
  })

  it('detects a server table that ignores isFetching', () => {
    const ignoring = '<DataTableServer columns={c} data={rows} isLoading={q.isLoading} />'
    const forwarding =
      '<DataTableServer columns={c} data={rows} isLoading={q.isLoading} isFetching={q.isFetching} />'
    const nested =
      '<DataTableServer emptyAction={<Button onClick={() => open()} />} isFetching={q.isFetching} />'
    expect(missingFetchingPropOffenders(ignoring)).toHaveLength(1)
    expect(missingFetchingPropOffenders(forwarding)).toHaveLength(0)
    expect(missingFetchingPropOffenders(nested)).toHaveLength(0)
  })

  it('detects a table container that can widen the page', () => {
    const bad = '<div className="w-full overflow-x-auto">'
    const good = '<div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain">'
    expect(scrollContainmentOffenders('src/shared/ui/data-table.tsx', bad)).toHaveLength(3)
    expect(scrollContainmentOffenders('src/shared/ui/data-table.tsx', good)).toEqual([])
    // The server wrapper has its own rule: it must be allowed to shrink.
    const wideServer = '<div data-slot="data-table-server" className={cn(\'flex flex-col gap-3\')}>'
    const shrinkableServer =
      '<div data-slot="data-table-server" className={cn(\'flex min-w-0 flex-col gap-3\')}>'
    expect(
      scrollContainmentOffenders('src/shared/ui/data-table-server.tsx', wideServer),
    ).toHaveLength(1)
    expect(
      scrollContainmentOffenders('src/shared/ui/data-table-server.tsx', shrinkableServer),
    ).toEqual([])
  })
})
