import { describe, expect, it } from 'vitest'

import {
  applicationSourceFiles,
  assertScannedFiles,
  readSource,
  relativeToRepo,
} from './support/source-scan'

/**
 * The query and render behaviour audit (eiams-frontend-e25-t05).
 *
 * Two rules are pinned over the production tree:
 *
 *  - a `staleTime` override is a NAMED policy constant (or
 *    `Number.POSITIVE_INFINITY` for session-scoped data), never an arbitrary
 *    number, so a cache window cannot drift away from the policy the shared
 *    query client documents;
 *  - a query whose key carries the REQUEST OBJECT its queryFn sends to a
 *    list endpoint keeps the previous page's rows while the next one loads,
 *    so a server-paginated table does not blank on every page change.
 *
 * The second rule is also the DISCOVERY tool: when it fails it names every
 * offending site, so a paginated query a cheap grep misses surfaces itself.
 */
const SCANNED = applicationSourceFiles()
const EXPECTED_SCANNED_FILES = 409

const NAMED_STALE_TIME = /staleTime\s*:\s*(OPERATIONAL_STALE_TIME|MASTER_DATA_STALE_TIME)\b/u
const SESSION_STALE_TIME = /staleTime\s*:\s*Number\.POSITIVE_INFINITY\b/u
const LIST_CALL = /\blist[A-Z]\w*\s*\(\s*([A-Za-z_$][\w$]*)/u

function staleTimeOffenders(source: string): string[] {
  const found: string[] = []
  source.split(/\r?\n/u).forEach((line, index) => {
    if (!/\bstaleTime\s*:/u.test(line)) {
      return
    }
    if (NAMED_STALE_TIME.test(line) || SESSION_STALE_TIME.test(line)) {
      return
    }
    found.push((index + 1).toString() + ': ' + line.trim())
  })
  return found
}

/** Blanks string literals with spaces of the same length so the indices line up. */
function withoutLiterals(text: string): string {
  const blank = (match: string): string => ' '.repeat(match.length)
  return text.replace(/'(?:[^'\\\n]|\\.)*'/gu, blank).replace(/"(?:[^"\\\n]|\\.)*"/gu, blank)
}

/** The balanced-brace options object that follows `useQuery(`. */
function optionsOf(source: string, from: number): string {
  const text = withoutLiterals(source)
  const start = text.indexOf('{', from)
  if (start < 0) {
    return ''
  }
  let depth = 0
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, index + 1)
      }
    }
  }
  return source.slice(start)
}

/** One top-level property of the options object. */
function propertyOf(options: string, name: string): string {
  const text = withoutLiterals(options)
  const marker = name + ':'
  const start = text.indexOf(marker)
  if (start < 0) {
    return ''
  }
  let depth = 0
  for (let index = start + marker.length; index < text.length; index += 1) {
    const character = text[index]
    if (character === '(' || character === '[' || character === '{') {
      depth += 1
    } else if (character === ')' || character === ']' || character === '}') {
      if (depth === 0) {
        return options.slice(start, index)
      }
      depth -= 1
    } else if (character === ',' && depth === 0) {
      return options.slice(start, index)
    }
  }
  return options.slice(start)
}

function pageQueryOffenders(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/\buseQuery[(<]/gu)) {
    const start = match.index ?? 0
    const options = optionsOf(source, start)
    if (options === '' || /placeholderData\s*:/u.test(options)) {
      continue
    }
    const key = propertyOf(options, 'queryKey')
    const listCall = LIST_CALL.exec(propertyOf(options, 'queryFn'))
    if (listCall === null) {
      continue
    }
    const request = listCall[1] ?? ''
    if (!new RegExp('\\b' + request + '\\b', 'u').test(key)) {
      continue
    }
    const line = source.slice(0, start).split(/\r?\n/u).length
    found.push(line.toString() + ': ' + (source.split(/\r?\n/u)[line - 1] ?? '').trim())
  }
  return found
}

function scanRule(detector: (source: string) => string[]): string[] {
  const found: string[] = []
  for (const file of SCANNED) {
    for (const offender of detector(readSource(file))) {
      found.push(relativeToRepo(file) + ': ' + offender)
    }
  }
  return found
}

describe('query and render profile audit (eiams-frontend-e25-t05)', () => {
  it('scans the pinned set of production files', () => {
    assertScannedFiles(SCANNED, EXPECTED_SCANNED_FILES)
  })

  it('never uses an arbitrary staleTime number', () => {
    expect(scanRule(staleTimeOffenders)).toEqual([])
  })

  it('uses a named staleTime policy constant', () => {
    expect(scanRule(staleTimeOffenders)).not.toContain(expect.stringContaining('staleTime: 1'))
  })

  it('keeps the previous page visible while the next one loads', () => {
    expect(scanRule(pageQueryOffenders)).toEqual([])
  })

  it('detects an arbitrary staleTime number', () => {
    expect(staleTimeOffenders('useQuery({ staleTime: 1234 })')).toHaveLength(1)
    expect(staleTimeOffenders('useQuery({ staleTime: OPERATIONAL_STALE_TIME })')).toHaveLength(0)
    expect(staleTimeOffenders('useQuery({ staleTime: Number.POSITIVE_INFINITY })')).toHaveLength(0)
  })

  it('detects a staleTime that is not a named policy constant', () => {
    expect(staleTimeOffenders('useQuery({ staleTime: 5000 })')).toHaveLength(1)
    expect(
      staleTimeOffenders('useQuery({ staleTime: 5000, staleTime: MASTER_DATA_STALE_TIME })'),
    ).toHaveLength(0)
  })

  it('detects a page-carrying query that keeps no placeholder data', () => {
    const withoutPlaceholder =
      'useQuery({ queryKey: keys.list(scope, query), queryFn: () => service.listItems(query) })'
    const withPlaceholder =
      'useQuery({ queryKey: keys.list(scope, query), queryFn: () => service.listItems(query), placeholderData: keepPreviousData })'
    const rowScan =
      'useQuery({ queryKey: keys.row(scope, custodyId), queryFn: () => service.listItems({ page: 1 }) })'
    expect(pageQueryOffenders(withoutPlaceholder)).toHaveLength(1)
    expect(pageQueryOffenders(withPlaceholder)).toHaveLength(0)
    expect(pageQueryOffenders(rowScan)).toHaveLength(0)
  })
})
