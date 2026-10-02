import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { auditService } from '@/modules/audit/services/audit.service'
import { assetService } from '@/modules/asset/services/asset.service'
import { inventoryService } from '@/modules/inventory/services/inventory.service'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { AssetMovementLedger } from '@/modules/asset/components/asset-movement-ledger'
import AuditLogExplorerPage from '@/modules/audit/pages/audit-log-explorer-page'
import AssetCustodyHistoryPage from '@/modules/asset/pages/asset-custody-history-page'
import { clearScopedQueries } from '@/shared/services/query-keys'
import { formatDateTime } from '@/shared/utils/format'
import { createCrossModuleScenario } from '@/test/msw/cross-module-scenarios'
import {
  createAssetCustody,
  createAssetMovement,
  createAuditLog,
  createAuditLogEntry,
  createPage,
  createSession,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import {
  applicationSourceFiles,
  readSource,
  relativeToRepo,
  sourceFilesIn,
} from '@/test/support/source-scan'

import auditServiceSource from '@/modules/audit/services/audit.service.ts?raw'
import assetServiceSource from '@/modules/asset/services/asset.service.ts?raw'
import inventoryServiceSource from '@/modules/inventory/services/inventory.service.ts?raw'

/**
 * Immutable ledgers and audit inspection (eiams-frontend-e24-t08).
 *
 * The invariant pinned here is that all five append-only ledgers — StockMovement,
 * AuditLog, AuditLogEntry, AssetMovement, AssetCustody — are READ-ONLY in the
 * frontend: the browser can display, filter, page, and (for audit) navigate
 * between them, and can never author, edit, or delete a row.
 *
 * The read-only claim is therefore mostly a claim about ABSENCE, and a test that
 * calls a mutation cannot prove absence. The honest proof is a static one —
 * there is no write verb on a ledger service, no cache-write call that targets
 * a ledger query key, and no write handler registered for a ledger endpoint on
 * any mock surface — so those three checks are asserted against the real source.
 * The behavioural cases then cover what a behavioural test can prove: that the
 * read path is the only path, that the five ledgers' rows are consumable as-is,
 * and that the surfaces a user actually reads (audit detail, custody timeline,
 * movement ledger) present the evidence the ledgers hold.
 *
 * The mock-surface check used to read `src/mocks/handlers.ts?raw` — the runtime
 * development mock, deleted by `eiams-frontend-m4jm`. It now scans `src/test/**`,
 * which is the only mock surface left; see the case body for why the assertion
 * was repointed rather than dropped.
 *
 * MSW proves nothing about the backend: not transaction atomicity, not
 * append-only enforcement, not RBAC or scope filtering on ledger rows. Those are
 * server guarantees and are out of reach of any browser test.
 */

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: { kind: 'enterprise' } as unknown }),
}))

const API_BASE_URL = '/api/v1'
const UNKNOWN_AUDIT_LOG_ID = fixtureUuid(4242)
const SCENARIO = createCrossModuleScenario()

function renderWithProviders(ui: React.ReactNode, entry = '/audit') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, createSession({ permissionCodes: ['audit.view'] }))
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[entry]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }
  return render(ui, { wrapper: Wrapper })
}

// --- Static read-only proof ----------------------------------------------------

const LEDGER_SERVICE_SOURCES: Readonly<Record<string, string>> = {
  'inventory.service.ts': inventoryServiceSource,
  'asset.service.ts': assetServiceSource,
  'audit.service.ts': auditServiceSource,
}

/**
 * Path fragments that identify a ledger endpoint in ANY mock surface.
 *
 * Suffix form (`/movements`, not `/inventory/movements`) on purpose: handlers
 * build their paths from a prefix — `${API_BASE_URL}/inventory/movements`,
 * `${environment.apiBaseUrl}/assets/${assetId}/custody` — so only the tail is
 * common to all of them. A prefix-matching fragment set would silently skip
 * every handler that interpolates, which is most of them, and turn the scan
 * below into a pass over nothing.
 */
const LEDGER_WIRE_FRAGMENTS = [
  '/balances',
  '/movements',
  '/assets/:assetId/movements',
  '/assets/:assetId/custody',
  '/custodies',
  '/audit-logs',
] as const

/**
 * A path fragment that is definitely NOT a ledger, and that the harness DOES
 * register write handlers for. Used as the negative control below: a scan that
 * cannot find this has stopped working and its "no offenders" verdict on the
 * ledger fragments means nothing.
 *
 * `/adjustments`, not `/documents`, and the distinction is the point. The
 * document handlers write through a `DOCUMENT_PREFIX` constant, so their path
 * string never appears in the source at all and no fragment could ever find
 * them; the adjustment paths are spelled out in template literals, so they are
 * genuinely detectable. A control chosen from the constant-built half would
 * have failed for a reason that has nothing to do with the scanner working.
 */
const WRITABLE_NON_LEDGER_FRAGMENT = '/adjustments'

/** Query-key builders and endpoint constants that name a ledger cache entry. */
const LEDGER_KEY_TOKENS = [
  'inventoryQueryKeys.movements',
  'inventoryQueryKeys.movement',
  'assetQueryKeys.movements',
  'assetQueryKeys.custody',
  'auditQueryKeys.logs',
  'auditQueryKeys.log',
  "'/inventory/movements'",
  "'/assets/{assetId}/movements'",
  "'/assets/{assetId}/custody'",
  "'/audit-logs'",
] as const

const CACHE_WRITE_VERBS = /\.(setQueryData|updateQueryData|removeQueries|onMutate)\b/u

/** Every mock surface left in the repository: the test harness, and only it. */
function mockSurfaceSourceFiles(): string[] {
  return sourceFilesIn(join(process.cwd(), 'src', 'test')).filter((file) => /\.tsx?$/u.test(file))
}

/**
 * The source with comment lines removed, so prose about handlers cannot be
 * mistaken for handlers.
 *
 * Necessary, not cosmetic: the version of this scan that read `src/mocks/**`
 * was immune because no comment in that file mentioned `http.post`. This file
 * does — the comment explaining WHY the assertion survived the deletion names
 * `http.post('/audit-logs')` as the thing that must never appear. Left
 * un-stripped, that comment is the one `http.post` the scan finds, and the guard
 * fails on its own documentation. Any future comment naming an example handler
 * does the same.
 *
 * Only LINE-LEADING comments are removed. A general `/* … *\/` stripper cannot
 * distinguish a block comment from the `/*` inside a string such as
 * `'src/**\/*.{test,spec}…'`, and this repo has those; swallowing the source
 * between the two would delete real registrations from the scan set instead of
 * prose from it. In TypeScript a line-leading `/*` cannot be inside a string.
 */
function withoutLeadingComments(source: string): string {
  return source.replace(/^[ \t]*\/\/[^\n]*$/gmu, '').replace(/^[ \t]*\/\*[\s\S]*?\*\//gmu, '')
}

/**
 * The verb that registered the handler whose path contains `fragment`, found by
 * scanning backwards over the short span between `http.<verb>(` and the path.
 */
function registeringVerbAt(source: string, index: number): string | undefined {
  const window = source.slice(Math.max(0, index - 120), index)
  const matches = [...window.matchAll(/http\.(get|post|put|patch|delete)\(/gu)]
  return matches.at(-1)?.[1]
}

interface Registration {
  readonly file: string
  readonly fragment: string
  readonly verb: string | undefined
}

/**
 * Every `http.<verb>( … <fragment>` registration across the mock surface.
 *
 * `verb === undefined` means the backward scan found no registration before the
 * fragment, i.e. the fragment appears in prose, a comment or an unrelated
 * expression rather than in a handler path. Callers must decide what to do with
 * those; silently treating them as `get` is how this kind of scan rots.
 */
function registrationsOf(fragments: readonly string[]): Registration[] {
  const found: Registration[] = []

  for (const file of mockSurfaceSourceFiles()) {
    const source = withoutLeadingComments(readFileSync(file, 'utf8'))
    for (const fragment of fragments) {
      let index = source.indexOf(fragment)
      while (index >= 0) {
        found.push({
          file: relativeToRepo(file),
          fragment,
          verb: registeringVerbAt(source, index),
        })
        index = source.indexOf(fragment, index + fragment.length)
      }
    }
  }

  return found
}

describe('the five ledgers expose no write path (static proof)', () => {
  it('declares only get/list methods on the three ledger services', () => {
    // The runtime shape is the contract: anything not named get/list would be a
    // new method to audit, so the assertion is on the actual exported objects.
    expect(Object.keys(inventoryService).sort()).toEqual([
      'getBalance',
      'getMovement',
      'listBalances',
      'listMovements',
    ])
    expect(Object.keys(assetService).sort()).toEqual([
      'getAsset',
      'getAssetCustodyTimeline',
      'listAssetMovements',
      'listAssets',
    ])
    expect(Object.keys(auditService).sort()).toEqual(['getAuditLog', 'listAuditLogs'])
  })

  it('keeps every ledger service method on a read verb', () => {
    for (const service of [inventoryService, assetService, auditService]) {
      for (const method of Object.keys(service)) {
        expect(method).toMatch(/^(get|list)[A-Z]/u)
      }
    }
  })

  it('issues no write verb from any ledger service', () => {
    for (const [name, source] of Object.entries(LEDGER_SERVICE_SOURCES)) {
      expect(source, `${name} must not call a write verb`).not.toMatch(
        /client\.(post|put|patch|delete)\s*\(/u,
      )
    }
  })

  it('never targets a ledger query key with a cache write or an optimistic update', () => {
    // `invalidateQueries` is deliberately NOT in this list: refetching a ledger
    // after an unrelated mutation is correct and necessary. Seeding a ledger
    // key from the client, or rolling one back, would let the browser author a
    // ledger row — which is exactly what append-only forbids.
    const offenders = applicationSourceFiles()
      .map((file) => ({ file, source: readSource(file) }))
      .filter(({ source }) => CACHE_WRITE_VERBS.test(source))
      .filter(({ source }) => LEDGER_KEY_TOKENS.some((token) => source.includes(token)))
      .map(({ file }) => relativeToRepo(file))
    expect(offenders).toEqual([])
  })

  it('finds a write registration on a non-ledger endpoint, so the scan below can fail', () => {
    // The negative control. This scan replaces one that read the source of the
    // deleted development mock (`src/mocks/handlers.ts`, removed by
    // `eiams-frontend-m4jm`), and it inherits that scan's whole weakness: it
    // reports "no offenders" just as happily when it has found nothing at all.
    // The harness registers `http.post` / `http.put` for the adjustment and
    // document engines, so this fragment MUST be detectable as a write — if it
    // ever stops being, the ledger verdict two cases down has changed subject.
    const control = registrationsOf([WRITABLE_NON_LEDGER_FRAGMENT])
    const writeVerbs = control
      .filter((registration) => registration.verb !== undefined && registration.verb !== 'get')
      .map(
        (registration) =>
          `${registration.file}: http.${registration.verb}( … ${registration.fragment}`,
      )

    expect(writeVerbs).not.toEqual([])
  })

  it('registers no write handler for a ledger endpoint anywhere in the mock surface', () => {
    // Why this still exists after `src/mocks/` was deleted
    // --------------------------------------------------
    // The old version read `src/mocks/handlers.ts?raw` and asserted the runtime
    // mock never registered a write verb on a ledger. Deleting that mock
    // removes the hazard by construction — there is no runtime mock left that
    // *could* answer a real request — but it also removes the check, and
    // "the directory is gone" is a fact about a commit, not a guard.
    //
    // Deleting it outright was the other option, and it was rejected: the
    // failure mode this catches is not gone. `src/test/msw/` is now the only
    // mock surface, and a harness that grew `http.post('/audit-logs')` could
    // author an append-only row in-process and then let this file assert, from
    // fake data, that no such thing happens. That is a test suite quietly
    // grading its own homework. So the same assertion now runs over the surface
    // that actually exists, and it is strictly wider than the old one: every
    // handler in `src/test/**`, not one registry in `src/mocks/`.
    const writeHandlers = registrationsOf(LEDGER_WIRE_FRAGMENTS)
      .filter((registration) => registration.verb !== undefined && registration.verb !== 'get')
      .map(
        (registration) =>
          `${registration.file}: http.${registration.verb}( … ${registration.fragment}`,
      )

    expect(writeHandlers).toEqual([])
  })

  it('keeps every ledger endpoint mocked on a read verb, so the scan above is not vacuous', () => {
    // The old version asserted the dev mock's GET registrations were present,
    // so the previous case could not pass merely because the endpoints were not
    // mocked at all. That failure mode survives the move, so it is re-anchored
    // on the harness: every ledger fragment must be present, and every
    // registration the scan can attribute to it must be `get`.
    const registrations = registrationsOf(LEDGER_WIRE_FRAGMENTS)
    const attributed = registrations.filter((registration) => registration.verb !== undefined)
    const getVerbs = attributed.filter((registration) => registration.verb === 'get')
    const otherVerbs = attributed.filter((registration) => registration.verb !== 'get')

    for (const fragment of LEDGER_WIRE_FRAGMENTS) {
      expect(
        attributed.filter((registration) => registration.fragment === fragment),
        `${fragment} has no attributable handler registration in the harness`,
      ).not.toEqual([])
    }
    expect(otherVerbs).toEqual([])
    expect(
      getVerbs.length,
      'the harness is expected to read every ledger through MSW; an empty set means ' +
        'the ledger read path is no longer exercised and the scan above is hollow',
    ).toBeGreaterThan(0)
  })

  it('drops ledger caches on a session scope change, not through a ledger write', () => {
    // The one legitimate wholesale eviction: switching the active scope or
    // signing out drops the whole scoped namespace, ledger entries included.
    // That is a session boundary, not a browser-authored ledger row, so it is
    // asserted as behaviour rather than forbidden.
    const client = new QueryClient()
    const auditKey = ['scoped', 'enterprise', null, 'audit', 'logs', { pageIndex: 0 }]
    const custodyKey = ['scoped', 'enterprise', null, 'asset', 'assets', 'A1', 'custody']
    client.setQueryData(auditKey, ['row'])
    client.setQueryData(custodyKey, ['row'])

    return clearScopedQueries(client).then(() => {
      expect(client.getQueryData(auditKey)).toBeUndefined()
      expect(client.getQueryData(custodyKey)).toBeUndefined()
    })
  })
})

// --- The read path is the only path -------------------------------------------

describe('the cross-module ledger graph is consumable through the production services', () => {
  it('reads every ledger with get/list and returns the scenario rows as-is', async () => {
    const { ledgers } = SCENARIO
    const requested: string[] = []
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        HttpResponse.json(createPage(ledgers.balances)),
      ),
      http.get(`${API_BASE_URL}/inventory/movements`, () =>
        HttpResponse.json(createPage(ledgers.stockMovements)),
      ),
      http.get(`${API_BASE_URL}/assets/:assetId/movements`, () =>
        HttpResponse.json(createPage(ledgers.assetMovements)),
      ),
      http.get(`${API_BASE_URL}/assets/:assetId/custody`, () =>
        HttpResponse.json(ledgers.custodies),
      ),
      http.get(`${API_BASE_URL}/audit-logs`, ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('pageIndex') ?? '')
        return HttpResponse.json(createPage(ledgers.auditLogs))
      }),
    )

    // These services speak the transport's one-based `page` directly; only the
    // services still on the shared `toWirePaginationParams` helper take a
    // zero-based `pageIndex`.
    const balances = await inventoryService.listBalances({ page: 1, pageSize: 10 })
    const stockMovements = await inventoryService.listMovements({ page: 1, pageSize: 10 })
    const assetMovements = await assetService.listAssetMovements(SCENARIO.assets.returned.assetId, {
      pageIndex: 0,
      pageSize: 10,
    })
    const custodies = await assetService.getAssetCustodyTimeline(SCENARIO.assets.returned.assetId)
    const auditLogs = await auditService.listAuditLogs({ pageIndex: 0, pageSize: 10 })

    expect(balances.items).toEqual(ledgers.balances)
    expect(stockMovements.items).toEqual(ledgers.stockMovements)
    expect(assetMovements.items).toEqual(ledgers.assetMovements)
    expect(custodies).toEqual(ledgers.custodies)
    expect(requested).toEqual(['0'])
    // D-AUD-02: the list read is headers only. Entries stay out of the cache.
    expect(auditLogs.items.map((log) => log.entries)).toEqual([[], [], []])
  })

  it('keeps the redacted audit entry server-redacted through the detail read', async () => {
    const redactedLog = SCENARIO.ledgers.auditLogs.find((log) =>
      log.entries.some((entry) => entry.redacted),
    )
    if (!redactedLog) throw new Error('scenario is expected to carry a redacted audit entry')
    const redactedEntry = redactedLog.entries.find((entry) => entry.redacted)!

    server.use(
      http.get(`${API_BASE_URL}/audit-logs/:auditLogId`, () => HttpResponse.json(redactedLog)),
    )

    const detail = await auditService.getAuditLog(redactedLog.auditLogId)

    expect(detail.auditLogId).toBe(redactedLog.auditLogId)
    expect(detail.entries).toEqual(redactedLog.entries)
    expect(detail.entries.at(-1)).toEqual(redactedEntry)
    // The withheld value never existed on the fixture, and the sanitizer must
    // not reintroduce one.
    expect(redactedEntry).not.toHaveProperty('oldValue')
    expect(redactedEntry).not.toHaveProperty('newValue')
    expect(redactedEntry.redactionReasonAr).toBeTruthy()
  })

  it('seeds an asset movement and a custody row from the shared factories', () => {
    // The scenario graph predates `createAssetMovement` and writes its rows as
    // literals; the factory is the supported way to author one, so pin that it
    // produces a contract-complete append-only row.
    const movement = createAssetMovement({ eventType: 'Issued', toWarehouse: undefined })
    const custody = createAssetCustody({ status: 'Closed', toTs: '2026-08-23T10:00:00.000Z' })

    expect(movement).toMatchObject({ eventType: 'Issued', assetId: expect.any(String) })
    expect(movement).not.toHaveProperty('fromWarehouse')
    expect(custody.status).toBe('Closed')
    expect(createAssetMovement().eventType).toBe('Received')
  })
})

// --- AuditDetail branches that had no coverage --------------------------------

describe('AuditDetail read branches', () => {
  it('shows the Arabic error state for an unknown auditLogId instead of an empty diff', async () => {
    server.use(
      http.get(`${API_BASE_URL}/audit-logs/:auditLogId`, ({ params }) =>
        params['auditLogId'] === UNKNOWN_AUDIT_LOG_ID
          ? HttpResponse.json(
              { code: 'audit.not_found', titleAr: 'السجل غير موجود', status: 404 },
              { status: 404 },
            )
          : HttpResponse.json(createAuditLog()),
      ),
    )

    renderWithProviders(<AuditLogExplorerPage />, `/audit?auditLogId=${UNKNOWN_AUDIT_LOG_ID}`)

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل تفاصيل سجل التدقيق' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  })

  it('renders the empty branch for an audit log with zero field entries', async () => {
    const auditLog = createAuditLog({ auditLogId: fixtureUuid(4301), entries: [] })
    server.use(
      http.get(`${API_BASE_URL}/audit-logs/:auditLogId`, () => HttpResponse.json(auditLog)),
    )

    renderWithProviders(<AuditLogExplorerPage />, `/audit?auditLogId=${auditLog.auditLogId}`)

    expect(
      await screen.findByText('لا توجد حقول متغيّرة مسجّلة لعملية التدقيق هذه.'),
    ).toBeInTheDocument()
  })

  it('falls back to the fixed Arabic redaction reason when the server sends none', async () => {
    // `redactionReasonAr` is nullable in the contract; D-AUD-02 requires a
    // fixed Arabic sentence rather than an empty gap.
    const auditLog = createAuditLog({
      auditLogId: fixtureUuid(4302),
      entries: [
        createAuditLogEntry({
          fieldName: 'authorizationHeader',
          oldValue: null,
          newValue: null,
          redacted: true,
          redactionReasonAr: null,
        }),
      ],
    })
    server.use(
      http.get(`${API_BASE_URL}/audit-logs/:auditLogId`, () => HttpResponse.json(auditLog)),
    )

    renderWithProviders(<AuditLogExplorerPage />, `/audit?auditLogId=${auditLog.auditLogId}`)

    expect(await screen.findByText('القيمة محجوبة وفق سياسة التدقيق.')).toBeInTheDocument()
    expect(screen.getAllByText('قيمة محجوبة').length).toBeGreaterThan(0)
    // The field code stays readable, and the withheld values stay unwritten.
    expect(screen.getByText('authorizationHeader')).toBeInTheDocument()
    expect(screen.getByText('القيمة السابقة').nextElementSibling).toHaveTextContent('قيمة محجوبة')
  })

  it('round-trips list → detail → back through the shared auditLogId param', async () => {
    const user = userEvent.setup()
    const auditLog = createAuditLog({
      auditLogId: fixtureUuid(4303),
      entityDisplay: 'سند ترحيل تجريبي',
      summaryAr: 'تم ترحيل السند.',
      entries: [
        createAuditLogEntry({ fieldName: 'documentStatus', oldValue: 'Draft', newValue: 'Posted' }),
      ],
    })
    const detailRequests: string[] = []
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () => HttpResponse.json(createPage([auditLog]))),
      http.get(`${API_BASE_URL}/audit-logs/:auditLogId`, ({ params }) => {
        detailRequests.push(String(params['auditLogId']))
        return HttpResponse.json(auditLog)
      }),
    )

    renderWithProviders(<AuditLogExplorerPage />)

    const detailLink = await screen.findByRole('link', {
      name: 'عرض تفاصيل سجل التدقيق 00000000…',
    })
    expect(detailRequests).toEqual([])

    await user.click(detailLink)
    expect(await screen.findByRole('heading', { name: 'تفاصيل سجل التدقيق' })).toBeInTheDocument()
    expect(detailRequests).toEqual([auditLog.auditLogId])
    expect(screen.getByText('سند ترحيل تجريبي')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'العودة إلى السجل' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'سجل التدقيق' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'تفاصيل سجل التدقيق' })).not.toBeInTheDocument()
  })

  it('treats a blank ?auditLogId= as absent: no detail request and no error state', async () => {
    // `?? undefined` would keep `''`, enable the detail query, and request
    // `GET /audit-logs/` for a parameter the user never filled in.
    const detailRequests: string[] = []
    server.use(
      http.get(`${API_BASE_URL}/audit-logs`, () =>
        HttpResponse.json(createPage([createAuditLog({ auditLogId: fixtureUuid(4304) })])),
      ),
      http.get(/\/api\/v1\/audit-logs\//u, ({ request }) => {
        detailRequests.push(new URL(request.url).pathname)
        return HttpResponse.json({ code: 'audit.not_found', status: 404 }, { status: 404 })
      }),
    )

    renderWithProviders(<AuditLogExplorerPage />, '/audit?auditLogId=')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سجل التدقيق' }),
    ).toBeInTheDocument()
    expect(detailRequests).toEqual([])
    expect(screen.queryByRole('heading', { name: 'تفاصيل سجل التدقيق' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إعادة المحاولة' })).not.toBeInTheDocument()
  })
})

// --- Custody timeline: the end time is evidence, not decoration ---------------

describe('the custody timeline surfaces a closed row end time', () => {
  const ASSET_ID = fixtureUuid(4401)
  const CLOSED_TO_TS = '2026-08-23T10:00:00.000Z'
  const closed = createAssetCustody({
    assetId: ASSET_ID,
    assetNumber: 'AST-2026-2001',
    custodyId: fixtureUuid(4402),
    fromTs: '2026-08-21T10:00:00.000Z',
    status: 'Closed',
    toTs: CLOSED_TO_TS,
  })
  const active = createAssetCustody({
    assetId: ASSET_ID,
    assetNumber: 'AST-2026-2001',
    custodyId: fixtureUuid(4403),
    fromTs: '2026-08-24T10:00:00.000Z',
    holder: { displayName: 'أحمد الخالد' },
    status: 'Active',
    toTs: null,
  })

  function renderTimeline() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <MemoryRouter initialEntries={[`/assets/${ASSET_ID}/custody`]}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/assets/:assetId/custody" element={<AssetCustodyHistoryPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
  }

  it('renders the closed row end time as an Arabic timestamp, never a raw ISO string', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/:assetId/custody`, () =>
        HttpResponse.json([closed, active]),
      ),
    )
    renderTimeline()

    expect(await screen.findByText('مديرية المعلوماتية')).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(CLOSED_TO_TS))).toBeInTheDocument()
    expect(screen.queryByText(CLOSED_TO_TS)).not.toBeInTheDocument()
    expect(screen.getByText(formatDateTime(closed.fromTs))).toBeInTheDocument()
  })

  it('shows no end time for a still-open custody row', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/:assetId/custody`, () =>
        HttpResponse.json([closed, active]),
      ),
    )
    renderTimeline()

    const activeRow = (await screen.findByText('أحمد الخالد')).closest('tr')
    expect(activeRow?.textContent).toContain('—')
    expect(activeRow?.textContent).not.toContain(formatDateTime(closed.toTs as string))
  })

  it('exposes no mutation affordance and recovers with the shared button', async () => {
    let attempts = 0
    server.use(
      http.get(`${API_BASE_URL}/assets/:assetId/custody`, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json([closed, active])
      }),
    )
    const user = userEvent.setup()
    renderTimeline()

    expect(
      await screen.findByRole('heading', { name: 'تعذّر تحميل سجل العهدة' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toHaveAttribute(
      'data-slot',
      'button',
    )
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByText('مديرية المعلوماتية')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /تكليف|مبادلة|حفظ|تعديل|حذف/ }),
    ).not.toBeInTheDocument()
  })
})

// --- The movement ledger paginates for real -----------------------------------

describe('the asset movement ledger pages against the server', () => {
  const ASSET_ID = fixtureUuid(4501)

  function movementPage(pageIndex: number) {
    return createPage(
      [
        createAssetMovement({
          assetId: ASSET_ID,
          documentReference: `EIAMS-MOV-2026-000${pageIndex + 1}`,
          movementId: fixtureUuid(4510 + pageIndex),
          occurredAt: '2026-08-2' + (pageIndex + 1) + 'T10:00:00.000Z',
        }),
      ],
      { pageIndex, pageSize: 10, totalItems: 3, totalPages: 3 },
    )
  }

  it('requests the next page index when the page control is used', async () => {
    const user = userEvent.setup()
    const requested: string[] = []
    server.use(
      http.get(`${API_BASE_URL}/assets/:assetId/movements`, ({ request }) => {
        const pageIndex = new URL(request.url).searchParams.get('pageIndex') ?? ''
        requested.push(pageIndex)
        return HttpResponse.json(movementPage(Number(pageIndex)))
      }),
    )
    renderWithProviders(<AssetMovementLedger assetId={ASSET_ID} />, '/assets/1')

    expect(await screen.findByText('EIAMS-MOV-2026-0001')).toBeInTheDocument()
    expect(await screen.findByText('صفحة ١ من ٣')).toBeInTheDocument()
    expect(requested).toEqual(['0'])

    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }))

    expect(await screen.findByText('EIAMS-MOV-2026-0002')).toBeInTheDocument()
    await waitFor(() => expect(requested).toEqual(['0', '1']))
    expect(screen.getByText('صفحة ٢ من ٣')).toBeInTheDocument()
  })

  it('formats the event timestamp instead of rendering the raw ISO value', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/:assetId/movements`, () =>
        HttpResponse.json(movementPage(0)),
      ),
    )
    renderWithProviders(<AssetMovementLedger assetId={ASSET_ID} />, '/assets/1')

    expect(await screen.findByText(formatDateTime('2026-08-21T10:00:00.000Z'))).toBeInTheDocument()
    expect(screen.queryByText('2026-08-21T10:00:00.000Z')).not.toBeInTheDocument()
  })
})
