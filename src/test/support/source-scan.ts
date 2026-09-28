import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Shared helpers for the source-scanning architecture tests
 * (eiams-frontend-xlfs).
 *
 * These were previously private to `immutable-ledgers-audit.test.tsx`. Hoisting
 * them here means the repo has ONE way to scan source, rather than a third copy
 * appearing alongside the two tests that need it.
 *
 * Every scan built on these helpers carries its own non-vacuity evidence. A scan
 * whose file set is empty, or whose pattern matches nothing, passes an
 * "expect no offenders" assertion while proving nothing at all — which is
 * exactly how a guard dies quietly. See `assertScannedFiles` and the
 * per-scan negative controls in the consuming test.
 */

/** Every `.ts`/`.tsx` file under `dir`, recursively. */
export function sourceFilesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFilesIn(full)
    return /\.tsx?$/u.test(entry.name) ? [full] : []
  })
}

/** Application source only — assertions are about production code, not fixtures. */
export function applicationSourceFiles(): string[] {
  return sourceFilesIn(join(process.cwd(), 'src')).filter(
    (file) => !/\.test\.tsx?$/u.test(file) && !file.includes(`${sep}test${sep}`),
  )
}

/** Repo-relative, forward-slashed path — so a failure message names the file readably. */
export function relativeToRepo(file: string): string {
  return relative(process.cwd(), file).split(sep).join('/')
}

export function readSource(file: string): string {
  return readFileSync(file, 'utf8')
}

/** Forward-slashed absolute path, so path predicates read as plain string checks. */
function normalized(file: string): string {
  return file.split(sep).join('/')
}

/**
 * Application source under any `modules/<name>/hooks/` directory, plus
 * `shared/documents/use-*.ts`.
 *
 * The shared half matters: narrowing this to the module hooks alone would
 * silently miss `use-document-draft-mutations.ts`, whose positional key
 * predicate is the most dangerous instance of the class this guards.
 */
export function moduleHookFiles(): string[] {
  const inModuleHooks = (file: string): boolean => {
    const path = normalized(file)
    return path.includes('/src/modules/') && path.includes('/hooks/') && path.endsWith('.ts')
  }
  const inSharedDocuments = (file: string): boolean => {
    const path = normalized(file)
    return path.includes('/src/shared/documents/') && /\/use-[^/]+\.ts$/u.test(path)
  }
  return applicationSourceFiles().filter((file) => inModuleHooks(file) || inSharedDocuments(file))
}

/**
 * The contract-only service set: every `*.service.ts` under a module's
 * `services` directory, plus the shared `-service` / `-transport` modules.
 *
 * This is the same set the ESLint service-purity rules are scoped to. Both
 * scopes are deliberately narrow: a wider `services` glob would also match
 * `auth/session-lifecycle.ts` and `auth/active-scope-context.ts`, which
 * legitimately own the QueryClient and the auth session key.
 */
export function featureServiceFiles(): string[] {
  const isModuleService = (file: string): boolean => {
    const path = normalized(file)
    return (
      path.includes('/src/modules/') && path.includes('/services/') && path.endsWith('.service.ts')
    )
  }
  const isSharedTransport = (file: string): boolean => {
    const path = normalized(file)
    return path.includes('/src/shared/') && /\/[^/]+(-service|-transport)\.ts$/u.test(path)
  }
  return applicationSourceFiles().filter((file) => isModuleService(file) || isSharedTransport(file))
}

/**
 * A reviewed exception, declared in the SOURCE next to the code it excuses:
 *
 *     // standard-allow: hand-derived-query-key — reasoned here in words
 *
 * Deliberately not `eslint-disable-next-line`: that is invisible to a source
 * scan, and it would be a lie for a rule implemented as a test. Deliberately not
 * a `Set` of `file:line` strings or a filter inside the test: those live far
 * from the code and drift silently. Here the justification shows up in the diff
 * as a sentence a reviewer reads, and `assertAllowlistIsSmall` keeps the set
 * from becoming a dumping ground.
 *
 * A marker without a real reason is rejected, so a "temporary" exception cannot
 * be added without writing something.
 */
const ALLOW_MARKER = /^\s*\/\/\s*standard-allow:\s*([a-z0-9-]+)\s+—\s+(.{12,})$/u

export interface AllowMarker {
  readonly rule: string
  readonly reason: string
  /** 0-based line index the marker excuses. */
  readonly line: number
}

export function allowMarkersIn(source: string): AllowMarker[] {
  const found: AllowMarker[] = []
  source.split(/\r?\n/u).forEach((line, index) => {
    const match = ALLOW_MARKER.exec(line)
    if (match !== null) {
      found.push({ rule: match[1] as string, reason: match[2] as string, line: index })
    }
  })
  return found
}

/**
 * How many lines after a marker it excuses.
 *
 * A marker normally sits directly above the construct it excuses, but these
 * constructs are multi-line — an `invalidateQueries({ queryKey: [...] })` call
 * spans three or four. Excusing only the marker's own line therefore left the
 * real violation in place, which is worse than not having the escape at all: it
 * looks like it works and does not.
 */
const ALLOW_WINDOW_LINES = 4

/**
 * Drops lines excused by a `standard-allow` marker for `rule`, so a scan sees
 * only code that has not been explicitly reviewed and excused.
 */
export function withoutAllowMarkers(source: string, rule: string): string {
  const lines = source.split(/\r?\n/u)
  const dropped = new Set<number>()
  for (const marker of allowMarkersIn(source)) {
    if (marker.rule !== rule) continue
    for (let offset = 0; offset < ALLOW_WINDOW_LINES; offset += 1) {
      dropped.add(marker.line + offset)
    }
  }
  return lines.filter((_line, index) => !dropped.has(index)).join('\n')
}

/**
 * The single most important guard in this file.
 *
 * Asserts the scan actually looked at a specific number of files. A count is
 * used rather than a `> 0` check because a narrowed or broken glob usually
 * leaves a handful of files rather than none, and `> 0` would wave that through.
 */
export function assertScannedFiles(files: readonly string[], expected: number): void {
  if (files.length !== expected) {
    throw new Error(
      `Scan set drifted: expected ${expected} files but found ${files.length}. ` +
        `A narrowed glob turns every "no offenders" assertion into a silent pass, ` +
        `so this fails loudly instead. Found: ${files.map(relativeToRepo).join(', ')}`,
    )
  }
}

/** Keeps the exception set from growing without review. */
export function assertAllowlistIsSmall(allow: readonly AllowMarker[], max: number): void {
  if (allow.length > max) {
    throw new Error(
      `Too many standard-allow markers (${allow.length} > ${max}). A rule that needs more ` +
        `exceptions is the wrong rule, not a rule with too many exceptions. ` +
        `Markers: ${allow.map((a) => `${a.rule}@${a.line + 1}`).join(', ')}`,
    )
  }
}
