# Document-transport unwrap plan

**Status:** proposal, awaiting owner approval before any service-layer change
**Beads:** `eiams-frontend-whhu.13` (foundation), `eiams-frontend-r5rp` (remainder)
**Foundation commit:** `e545b1c feat(api): envelope seam ratified by D-ORIG-01 and live-wire verification`

---

## 1. Goal

Activate the envelope unwrap seam (already landed at `e545b1c`) across the
document-engine transport — `src/shared/documents/document-transport.ts` and
`src/shared/documents/document-attachment-service.ts` — so that:

- `documentService.listDocuments()` returns the page, not the envelope
- `documentService.getDocument()` and the draft CRUD return the document,
  not the envelope
- `documentService.getDocumentHistory()` and `getDocumentPolicy()` return
  their bodies, not the envelope
- The lifecycle action methods (`submit`, `post`, `revise`, `reject`,
  `cancel`, `reverse`) return `DocumentActionResult`, not the envelope
- `attachmentService.uploadAttachment()` returns the attachment, not the
  envelope
- `attachmentService.deleteAttachment()` is unchanged (204, no body)
- The MSW handlers that back these routes in tests return the wire-shaped
  envelope via `okJson` / `okPageJson` / `errJson` (already landed)

Without this activation, the document-engine surface is silently wrong
against the real backend: every consumer reads the envelope as if it were
the payload.

## 2. Type boundary (already proposed)

`src/shared/documents/types/document-transport.types.ts` — **file lands
in the same commit as this plan**, before any service change. It exports:

```ts
export type WarehouseDocumentListPage = {
  readonly items: readonly WarehouseDocument[]
  readonly page: number
  readonly pageSize: number
  readonly totalCount: number
  readonly totalPages: number
  readonly hasNextPage: boolean
}
```

This is the `UiPage<WarehouseDocument>` shape already used by
`DataTableServer` and `useServerPagination`. The spine/petal types
(`WarehouseDocument`, `WarehouseDocumentDraftRequest`,
`DocumentActionResult`, etc.) stay imported from the generated file.

**The activation changes ONLY the list-page wrapper.** Non-paged methods
keep their generated return type — `unwrapData<T>(response.data)` produces
the same `T` the generated type declares, so the signature is unchanged.

## 3. Patch set per file

### 3.1 `src/shared/documents/document-transport.ts`

```ts
// Imports — add the envelope helpers and the handwritten list-page type
import { toUiPage, unwrapData, unwrapPage } from '@/shared/api/envelope'
import type { WarehouseDocumentListPage } from '@/shared/documents/types/document-transport.types'

// In DocumentService interface, change ONE signature:
listDocuments: (query: Readonly<ListWarehouseDocumentsQuery>) => Promise<WarehouseDocumentListPage>
// (every other signature stays the same)

// In createDocumentService, change exactly six call sites:
async listDocuments(query) {
  const response = await client.get(DOCUMENTS_PATH, { params: toQueryParams(query) })
  return toUiPage(unwrapPage<WarehouseDocument>(response.data))
}
async getDocument(documentId) {
  const response = await client.get(pathWithDocumentId(DOCUMENT_PATH, documentId))
  return unwrapData<WarehouseDocument>(response.data)
}
async createDocument(request) {
  const response = await client.post(DOCUMENTS_PATH, request)
  return unwrapData<WarehouseDocument>(response.data)
}
async updateDocument(documentId, request) {
  const response = await client.put(pathWithDocumentId(DOCUMENT_PATH, documentId), request)
  return unwrapData<WarehouseDocument>(response.data)
}
async getDocumentHistory(documentId) {
  const response = await client.get(pathWithDocumentId(DOCUMENT_HISTORY_PATH, documentId))
  return unwrapData<DocumentLifecycleHistory>(response.data)
}
async getDocumentPolicy(documentId) {
  const response = await client.get(pathWithDocumentId(DOCUMENT_POLICY_PATH, documentId))
  return unwrapData<DocumentPolicy>(response.data)
}

// And the executeAction helper at line 116:
const executeAction = async (...) => {
  const response = await client.post(path, request, idempotentRequest.config)
  return unwrapData<DocumentActionResult>(response.data)
}
```

### 3.2 `src/shared/documents/document-attachment-service.ts`

```ts
import { unwrapData } from '@/shared/api/envelope'

// uploadAttachment — one call site:
const response = await client.post(pathWithSegments(ATTACHMENTS_PATH, documentId), form)
return unwrapData<DocumentAttachment>(response.data)
// deleteAttachment — unchanged (returns void; 204 carries no body)
```

### 3.3 `src/shared/documents/document-transport.test.ts`

Every `HttpResponse.json(createPage([document]))` → `okPageJson([document], { page: 1, pageSize: 1, totalCount: 1, totalPages: 1 })`.

Every `HttpResponse.json(document)` (the doc/hisory/policy/action fixtures)
→ `okJson(document)` (success, no pagination).

The error-path tests already use `errJson`; no change there.

Two assertions to update because the return shape changes:

- `await expect(service.listDocuments({...})).resolves.toEqual(createPage([document]))`
  → `await expect(service.listDocuments({...})).resolves.toEqual(toUiPage(wrappedPage))`
  where `wrappedPage = unwrapPage(PAGE_SUCCESS)` shape, OR simpler: assert
  on `{ items: [document], page: 1, pageSize: 25, totalCount: 1, totalPages: 1 }`.
- Every `request.json()` body assertion on `received[]` is a request body
  assertion, not a response assertion — **no change** (the request body is
  never wrapped, only the response is).

### 3.4 `src/shared/documents/document-attachment-service.test.ts`

Same pattern: `HttpResponse.json(attachment)` → `okJson(attachment)`.

### 3.5 Downstream hook tests (`use-document-queries.test.tsx` etc.)

The hook layer is a pass-through — `data: T | undefined` where T is
`WarehouseDocumentListPage` after activation. The current assertion at
`use-document-queries.test.tsx:172` reads `data?.items`. **No change
needed** — the field name `items` is preserved by the handwritten type.

### 3.6 `src/shared/documents/pages/document-list-page.tsx`

**One mechanical change at lines 264–265:**

```tsx
// before
totalCount={documentListQuery.data?.meta.totalItems}
totalPages={Math.max(documentListQuery.data?.meta.totalPages ?? 1, 1)}

// after
totalCount={documentListQuery.data?.totalCount}
totalPages={Math.max(documentListQuery.data?.totalPages ?? 1, 1)}
```

No other consumers of `documentService.listDocuments()` in the repo. The
4 hook consumers (`use-document-queries.ts`, `use-document-draft-mutations.ts`,
`use-document-lifecycle-actions.ts`, `use-document-attachments.ts`) do not
read `meta.*` — they pass through `data` to the page layer.

### 3.7 Receiving module consumer

`src/modules/receiving/services/receiving.service.ts` only calls
`documentService.createDocument` / `updateDocument` — both non-paged,
both returning `WarehouseDocument` (same type as before, only now sourced
from `unwrapData`). **No change needed** unless the service layer itself
reads `response.data` style — it does not, it uses the typed methods.

## 4. Risk register (Option B scope only)

| Risk | Likelihood | Mitigation |
|---|---|---|
| `createPage` factory still produces `{items, meta: {pageIndex, ...}}` (zero-based); some test imports it and the assertion `toEqual(createPage([document]))` would now compare a `UiPage` to a zero-based `PageMeta` | Certain | Replace each `createPage([x])` with a literal `{items: [x], page: 1, pageSize: 1, totalCount: 1, totalPages: 1, hasNextPage: false}` in the affected tests; do NOT change `createPage` itself in this commit (it's consumed by 25+ pages that still read the old shape — a separate migration) |
| `WarehouseDocument` shape itself contains nested `meta: PageMeta` fields | None verified, low | Verified by grep: only `meta.totalItems` / `meta.totalPages` reads at the page envelope level; document spine carries no `meta` |
| `pageRows` helper in `src/shared/ui/data-table` reads `page.items` | Compatible | Verified: already used by document-list-page; the field name `items` is preserved |
| Generated types will be regenerated someday, overwriting this handwritten file | N/A — handwritten file does not live under `src/shared/types/generated/` | Verified by path |
| Activation order — what if another module lands before document-engine? | Low | Document-engine is the spine; everything else depends on it. Land it first or in isolation. |

## 5. Commit plan (Option B execution)

| # | Commit | Files | Pre-commit gates |
|---|---|---|---|
| 1 | `feat(api): handwritten WarehouseDocumentListPage + unwrap plan` | `src/shared/documents/types/document-transport.types.ts` (new) + `docs/document-transport-unwrap-plan.md` (new) | typecheck, lint |
| 2 | `feat(documents): activate envelope unwrap in document-transport` | `document-transport.ts` + `document-transport.test.ts` + `document-list-page.tsx` | module-scoped vitest + typecheck + lint |
| 3 | `feat(documents): activate envelope unwrap in attachment-service` | `document-attachment-service.ts` + `document-attachment-service.test.ts` | same |

After commit 3 the document engine is fully envelope-aware. The
remaining 14 modules (`admin`, `auth`, `catalog`, `inventory`,
`inventory-count`, `issue`, `transfer`, `opening`, `organization`,
`asset`, `custody`, `audit`, `warehouse`, `adjustment`) follow the same
shape — each gets its own patch set per its existing test anatomy.

## 6. Out of scope (deferred beads)

- The 25 `data?.meta.totalItems` reads in other modules' list pages. Each
  module's unwrap commit fixes its own pages. Not part of the document
  engine.
- The `createPage` / `createPageMeta` / `createProblemDetails` factories
  in `src/test/msw/factories.ts`. Per r5rp acceptance: "replaced by
  real-shape helpers" — but the replacement is a test-tooling sweep across
  25+ consumers. Land after all modules have unwrapped, as a single
  `test(msw): retire createPage/createPageMeta in favour of wire-shaped
  helpers` commit.
- MSW handlers in `src/mocks/handlers.ts` that back non-document routes
  (101 routes total, 121 `HttpResponse.json` calls). The seam helpers
  exist; the handler rewrite is per-module alongside the service unwrap.
- Auth session shape (D-SRS-01, gated by `whhu.11`).

## 7. Verification at commit boundary

After commit 3, the following must all hold:

- `pnpm run typecheck` — 0 errors
- `pnpm run lint` — 0 errors, ≤ 5 tolerated warnings (unchanged)
- `pnpm exec vitest run src/shared/documents/` — all tests pass
- `pnpm exec vitest run src/modules/receiving/` — all tests pass
  (downstream consumer verification)
- `pnpm run format` then `pnpm run format:check` — clean

## 8. Why this is one commit (commits 2+3)

Per the skill's anti-thrashing rule: "Fix errors in coordinated passes,
not one at a time." The transport + its tests are coupled — changing the
service signature without updating the test assertions makes the test
fail; changing the test without changing the service makes it
redundant. The page consumer (`document-list-page.tsx`) is mechanical and
lives in the same pass because it has no own test scope.

Commit 3 (attachment service) is a separate logical unit because
attachments are an independent route family with their own test file.
