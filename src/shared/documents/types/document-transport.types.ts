/**
 * Handwritten transport types for the document engine.
 *
 * ## Why these exist
 *
 * The generated OpenAPI surface (`@/shared/types/generated/eiams-v1`) still
 * carries the provisional snapshot's zero-based, lowerCamel page shape:
 *
 * ```ts
 * interface WarehouseDocumentPage {
 *   items: readonly WarehouseDocument[]
 *   meta: {
 *     pageIndex: number          // zero-based
 *     pageSize: number
 *     totalItems: number
 *     totalPages: number
 *     hasPreviousPage: boolean
 *     hasNextPage: boolean
 *     itemCount: number
 *     totalCount: number
 *   }
 * }
 * ```
 *
 * The wire (verified 2026-09-29 against a running API) is one-based and
 * snake_case at the top level — `pagination` is a sibling of `data`, not a
 * property of it:
 *
 * ```json
 * {
 *   "success": true,
 *   "data": [ /* WarehouseDocument[] *\/ ],
 *   "pagination": {
 *     "page": 1, "page_size": 20, "total_items": 47, "total_pages": 3,
 *     "has_previous_page": false, "has_next_page": true, "total_count": 47
 *   },
 *   "meta": { "request_id": "…", "timestamp": "…" }
 * }
 * ```
 *
 * This means the current `documentService.listDocuments()` returns the
 * ENVELOPE, not the page — a silent defect (r5rp §"structural coupling").
 * Handwritten types here give the activation a place to land without a
 * 200-file generated-type rewrite.
 *
 * ## Shape choice
 *
 * The handwritten page is the `UiPage<T>` shape already exported by
 * `@/shared/api/envelope`. The transport's only job at the list boundary
 * is to translate wire → UI in one place (`unwrapPage` + `toUiPage`); no
 * module sees the envelope shape, and no module needs to know the page
 * numbering convention because `UiPage` is what `DataTableServer` and
 * `useServerPagination` already consume.
 *
 * ## What this file does NOT change
 *
 * - `WarehouseDocument`, `DocumentActionResult`, `DocumentLifecycleHistory`,
 *   `DocumentPolicy` and every other spine/petal type stay imported from the
 *   generated file. Only the *page* wrapper is handwritten.
 * - The hook layer (`useDocumentListQuery`) keeps its return type; the
 *   `data: T | undefined` shape is unchanged, only the `data` payload
 *   switches from `{ items, meta }` to `{ items, page, pageSize, totalCount,
 *   totalPages, hasNextPage }`. Consumers that read `data?.meta.totalItems`
 *   must switch to `data?.totalCount` — a one-line mechanical change per
 *   call site.
 *
 * ## Activation
 *
 * See `docs/document-transport-unwrap-plan.md` for the per-module patch set
 * and the commit ordering. This file is the type-only foundation; no
 * service-layer unwrap happens in the same commit.
 */

import type {
  WarehouseDocument,
  WarehouseDocumentDraftRequest,
} from '@/shared/types/generated/eiams-v1'

/**
 * The page shape `documentService.listDocuments()` returns.
 *
 * Matches `UiPage<WarehouseDocument>` from `@/shared/api/envelope` so the
 * one-translation-layer rule (wire → UI in one place) is preserved.
 */
export type WarehouseDocumentListPage = {
  readonly items: readonly WarehouseDocument[]
  readonly page: number
  readonly pageSize: number
  readonly totalCount: number
  readonly totalPages: number
  readonly hasNextPage: boolean
}

/**
 * The non-paged document spine, returned by `getDocument` and the draft
 * CRUD methods. Re-exported under the transport namespace so consumers
 * import from one place — the document engine is owned by this module and
 * the spelling lives here.
 */
export type { WarehouseDocument, WarehouseDocumentDraftRequest }
