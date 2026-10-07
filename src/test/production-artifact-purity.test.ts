import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, sep } from 'node:path'
import { build, resolveConfig, type ResolvedConfig } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { productionBuildOptions } from '@/config/production-build'

/**
 * Why this test exists
 * --------------------
 * A 517 kB MSW chunk (`browser-u-*.js`) reached `dist/` unnoticed, carrying
 * `setupWorker`, twenty-two `msw/passthrough` calls, the seed document number
 * `EIAMS-CNT-2026-0001` and the Arabic seed name `المستودع المركزي` into the
 * production artifact — plus `public/mockServiceWorker.js` copied to the output
 * root. Nothing failed. Every existing test read *source*, so a bundle that
 * legitimately pulls the mock layer in through a dynamic `import()` looks
 * identical to source text that never gets bundled at all.
 *
 * The governing requirement is `docs/development-environment-profiles.md:70-71`:
 * RESOLUTION-040 requires the sandbox to be **unable to enter a production
 * artifact**. `parseEnvironment` refusing to boot with a fixture flag on is only
 * half of that; the other half is that the fixture code must not be *present*
 * to be switched on. This test covers the artifact half, on real bytes.
 *
 * Why it builds for real
 * ----------------------
 * It runs the project's real `vite build` with the real
 * `productionBuildOptions`, into a throwaway directory. Reading the checked-in
 * `dist/` would let the guard pass or fail based on whatever happened to be
 * there — a stale `dist` makes a broken build look clean, which is the mirror
 * image of the failure this test exists to prevent.
 *
 * Why NODE_ENV is overridden (the trap that made this test unpassable)
 * -------------------------------------------------------------------
 * `vite build` run from a shell builds a production artifact. `vite build` run
 * from INSIDE Vitest does not, and silently. Vite derives `import.meta.env.DEV`
 * from `process.env.NODE_ENV`, and Vitest sets `NODE_ENV=test`; `build()` only
 * defaults it when it is unset. So `import.meta.env.DEV` is `true`, every
 * `import.meta.env.DEV ? … : …` dev-only branch SURVIVES, and the artifact
 * contains the mock chunk and the gallery chunk by design. Verified directly:
 * with `NODE_ENV=test` the build emits `browser-*.js` (503 kB) and
 * `gallery-page-*.js`; with `NODE_ENV=production` neither appears.
 *
 * That made this test's first draft impossible to pass — the failure was the
 * harness lying about what it built, not the application shipping a fixture. It
 * is also the more dangerous of the two mistakes to leave in place, because a
 * harness that builds with `DEV=true` looks like the *stricter* guard: it would
 * still catch a dirty production bundle, while being unable to certify a clean
 * one. So the build below runs with `NODE_ENV=production`, and the non-vacuity
 * test asserts the resolved config says so rather than trusting this comment.
 *
 * Still load-bearing after `src/mocks/` was deleted (`eiams-frontend-m4jm`)
 * because the class of defect is not the deleted directory. It is "a dev-only
 * branch whose reference is not behind `import.meta.env.DEV`", and the gallery
 * is a live example: it is still dev-only, still pruned by the same mechanism,
 * and would leak the same way if someone reached for it from a statically
 * referenced closure. A test that only passed because its subject was deleted
 * would not be a guard.
 *
 * Why non-vacuity is asserted here
 * -------------------------------
 * `support/source-scan.ts` documents the repo's standing failure mode: a scan
 * with an empty file set, or a pattern that matches nothing, sails through an
 * "expect no offenders" assertion while proving nothing. So this file carries
 * three independent pieces of non-vacuity evidence — the build is shown to have
 * run in production mode, it is shown to have produced a servable artifact
 * (entry chunk + CSS + non-zero chunk count), and the marker scanner is shown
 * to detect a marker in text that contains one.
 */

const BUILD_TIMEOUT_MS = 120_000

/**
 * Runs `run` with `NODE_ENV=production`, then restores whatever was there.
 *
 * `process.env.NODE_ENV` is process-global, so the restore is in a `finally`:
 * a build that throws must not leave every later test in the file believing it
 * is running a production build. `delete` rather than assigning `''` for the
 * unset case, because Vite treats an empty string as set.
 */
async function withProductionNodeEnv<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env['NODE_ENV']
  process.env['NODE_ENV'] = 'production'
  try {
    return await run()
  } finally {
    if (previous === undefined) {
      delete process.env['NODE_ENV']
    } else {
      process.env['NODE_ENV'] = previous
    }
  }
}

/** Files under the outDir that carry executable browser code. */
const JS_EXTENSION = '.js'
const CSS_EXTENSION = '.css'

/**
 * Any of these appearing in an emitted chunk means fixture code shipped.
 *
 * `setupWorker` and `msw/passthrough` name the MSW runtime, which can only be
 * present if a mock layer was bundled. The document number and the Arabic
 * warehouse name are seed values from `src/mocks/db.ts`; they are listed
 * alongside the runtime markers because a mock layer that were ever tree-shaken
 * down to its data would still be a production artifact answering from canned
 * records, and detecting that needs a data marker, not just a library marker.
 *
 * The data markers outlive the file they came from: `src/mocks/` was deleted in
 * `eiams-frontend-m4jm`, so nothing can reintroduce that seed — but a future
 * fixture layer could reintroduce the same *shape* of leak, and a guard whose
 * markers only ever matched one deleted file would be guarding nothing. Keeping
 * the literals also means this test's value is unchanged by the deletion: it
 * still fails if either string ever reaches a chunk.
 */
const FIXTURE_MARKERS = [
  'setupWorker',
  'msw/passthrough',
  'EIAMS-CNT-2026-0001',
  'المستودع المركزي',
] as const

type FixtureMarker = (typeof FIXTURE_MARKERS)[number]

/** Every entry emitted as a browser-loadable script, with its bytes. */
interface EmittedChunk {
  readonly relativePath: string
  readonly contents: string
}

interface ProductionArtifact {
  readonly outDir: string
  readonly chunks: readonly EmittedChunk[]
  readonly cssFiles: readonly string[]
  /** Module scripts the built `index.html` points at, and that exist on disk. */
  readonly entryScripts: readonly string[]
  readonly html: string
}

/**
 * The markers present in `contents`.
 *
 * Substring matching, not a module-graph analysis: the artifact is minified, so
 * the only stable signal that fixture code reached it is the literal text a
 * minifier cannot remove.
 */
function markersPresent(contents: string, markers: readonly string[]): FixtureMarker[] {
  return markers.filter((marker): marker is FixtureMarker => contents.includes(marker))
}

/**
 * Every `.js`/`.css` under `dir`, recursively.
 *
 * Recursive on purpose: a future `output.chunkFileNames` that nests chunks
 * would otherwise silently shrink this scan to the top level, which is precisely
 * the "narrowed glob turns a guard into a no-op" failure documented in
 * `support/source-scan.ts`.
 */
function emittedFilesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return emittedFilesIn(full)
    return entry.isFile() ? [full] : []
  })
}

const MODULE_SCRIPT_SRC = /<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/gu

function moduleScriptsIn(html: string): string[] {
  return [...html.matchAll(MODULE_SCRIPT_SRC)]
    .map((match) => match[1])
    .filter((src): src is string => typeof src === 'string')
    .map((src) => src.replace(/^\//u, ''))
}

function inspectArtifact(outDir: string): ProductionArtifact {
  const assetsDir = join(outDir, productionBuildOptions.assetsDir)
  const files = existsSync(assetsDir) ? emittedFilesIn(assetsDir) : []

  const chunks: EmittedChunk[] = files
    .filter((file) => file.endsWith(JS_EXTENSION))
    .map((file) => ({
      relativePath: file.split(sep).slice(outDir.split(sep).length).join('/'),
      contents: readFileSync(file, 'utf8'),
    }))

  const html = readFileSync(join(outDir, 'index.html'), 'utf8')

  return {
    outDir,
    chunks,
    cssFiles: files
      .filter((file) => file.endsWith(CSS_EXTENSION))
      .map((file) => file.split(sep).slice(outDir.split(sep).length).join('/')),
    entryScripts: moduleScriptsIn(html).filter((src) => existsSync(join(outDir, src))),
    html,
  }
}

interface NegativeControl {
  readonly marker: FixtureMarker
  readonly snippet: string
}

/**
 * One known-bad snippet per marker, run through the SAME `markersPresent` the
 * real scan uses. A guard that has never been seen to fail proves nothing, and
 * a hand-copied second implementation of the predicate could drift into passing
 * while the real one is broken.
 */
const NEGATIVE_CONTROLS: readonly NegativeControl[] = [
  { marker: 'setupWorker', snippet: 'const worker = setupWorker(...handlers)' },
  {
    // The form that actually survives minification: a bundler re-exporting the
    // MSW namespace keeps the bare `"<module>/<export>"` string as a key. A
    // snippet showing a call site instead would not contain the marker and the
    // control would fail for the wrong reason.
    marker: 'msw/passthrough',
    snippet: 'const ns = { "msw/passthrough": () => undefined }',
  },
  {
    marker: 'EIAMS-CNT-2026-0001',
    snippet: "const seeded = { documentNumber: 'EIAMS-CNT-2026-0001' }",
  },
  { marker: 'المستودع المركزي', snippet: "const seeded = { warehouseName: 'المستودع المركزي' }" },
]

describe('production artifact purity (RESOLUTION-040)', () => {
  let outDir = ''
  let artifact: ProductionArtifact | null = null
  let resolvedProductionConfig: ResolvedConfig | null = null

  beforeAll(async () => {
    const tempRoot = join(process.cwd(), 'node_modules', '.tmp')
    mkdirSync(tempRoot, { recursive: true })
    outDir = mkdtempSync(join(tempRoot, 'production-artifact-purity-'))

    await withProductionNodeEnv(async () => {
      // Resolved alongside the build so the non-vacuity assertion below reports
      // the mode THIS build ran in, not a separate best-effort resolution.
      // `defaultMode` is passed explicitly because it defaults to
      // `'development'` here, while `build()` passes `'production'` for itself —
      // resolving without it would describe a build that never happened.
      resolvedProductionConfig = await resolveConfig({ logLevel: 'silent' }, 'build', 'production')

      await build({
        logLevel: 'silent',
        build: {
          ...productionBuildOptions,
          outDir,
          emptyOutDir: true,
        },
      })
    })

    artifact = inspectArtifact(outDir)
  }, BUILD_TIMEOUT_MS)

  afterAll(() => {
    if (outDir !== '') rmSync(outDir, { recursive: true, force: true })
  })

  function built(): ProductionArtifact {
    if (artifact === null) throw new Error('The production build produced no artifact to inspect.')
    return artifact
  }

  describe('negative control', () => {
    it('covers every marker, so a newly added marker cannot ship unchecked', () => {
      expect(NEGATIVE_CONTROLS.map((control) => control.marker)).toEqual([...FIXTURE_MARKERS])
    })

    it.each(NEGATIVE_CONTROLS)('detects $marker in synthetic chunk text', ({ marker, snippet }) => {
      expect(markersPresent(snippet, FIXTURE_MARKERS)).toContain(marker)
    })

    it('does not flag ordinary production chunk text', () => {
      const clean = 'const o={...a,b:[...c]};export default function r(n){return n*2}'

      expect(markersPresent(clean, FIXTURE_MARKERS)).toEqual([])
    })
  })

  describe('the real build output', () => {
    it('built in production mode, so the pruning assertions below mean something', () => {
      // Non-vacuity, part zero. `import.meta.env.DEV` — the condition every
      // dev-only branch in this app is pruned behind — is derived from
      // NODE_ENV, and Vitest runs with NODE_ENV=test. If this build had run with
      // DEV=true, the mock chunk and the gallery chunk would be present *by
      // design* and "no fixture code found" would be a statement about a
      // development bundle. Asserting the resolved config is what stops the
      // guard from quietly changing subject.
      if (resolvedProductionConfig === null) {
        throw new Error('The production build never resolved a config to inspect.')
      }

      expect(resolvedProductionConfig.mode).toBe('production')
      expect(resolvedProductionConfig.isProduction).toBe(true)
    })

    it('produced a servable artifact, so the purity assertions below are not vacuous', () => {
      // Non-vacuity, part one. A build that emitted nothing, or a build whose
      // `assets/` glob silently matched nothing, would leave "no markers found"
      // as a trivially true statement about an empty directory.
      const built0 = built()

      expect(
        built0.chunks.length,
        `expected emitted .js chunks under ${built0.outDir}`,
      ).toBeGreaterThan(0)

      expect(
        built0.entryScripts.length,
        `expected index.html to reference at least one emitted chunk`,
      ).toBeGreaterThan(0)

      expect(
        built0.cssFiles.length,
        'expected the production build to emit split CSS (cssCodeSplit is on)',
      ).toBeGreaterThan(0)

      expect(built0.html).toContain('<div id="root">')
    })

    it('emits no fixture code in any chunk', () => {
      const offenders = built().chunks.flatMap((chunk) =>
        markersPresent(chunk.contents, FIXTURE_MARKERS).map(
          (marker) => `${chunk.relativePath}: ${marker}`,
        ),
      )

      expect(
        offenders,
        'Fixture/mock code reached the production artifact. RESOLUTION-040 ' +
          '(docs/development-environment-profiles.md:70-71) requires the sandbox to be unable to ' +
          'enter a production artifact.',
      ).toEqual([])
    })

    it('does not ship the MSW service worker script', () => {
      // `public/` is copied verbatim into every outDir, so the worker script
      // reaches production with no bundler involvement at all — the mock layer
      // becomes installable by the browser whether or not any chunk boots it.
      const worker = join(built().outDir, 'mockServiceWorker.js')

      expect(
        existsSync(worker),
        'mockServiceWorker.js was copied from public/ into the production outDir',
      ).toBe(false)
    })
  })
})
