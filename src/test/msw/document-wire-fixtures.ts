import {
  createDocumentAttachment,
  createDocumentPolicy,
  createLifecycleEvent,
  createWarehouseDocument,
  type FixtureOverrides,
} from '@/test/msw/factories'
import {
  toWireAttachment,
  toWireDetails,
  toWireHistory,
  toWireLifecycleEvent,
  toWirePolicy,
  toWireSummary,
} from '@/test/msw/warehouse-document-handlers'
import type { DocumentLifecycleEvent as GeneratedLifecycleEvent } from '@/shared/types/generated/eiams-v1'
import type {
  DocumentAttachmentResponse,
  DocumentLifecycleEvent,
  DocumentLifecycleHistory,
  DocumentPolicy,
  DocumentStatus,
  WarehouseDocumentDetails,
  WarehouseDocumentSummary,
} from '@/shared/documents/types/document-wire.types'

/**
 * Wire-shaped builders for the tests that talk to the shared document engine.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/test/msw/warehouse-document-handlers.ts` keeps ONE in-memory model of a
 * document — the nested snapshot `WarehouseDocument` — and projects it into the
 * handwritten wire contract (`document-wire.types.ts`) on every response. That
 * boundary is deliberate: the transition engine, the idempotency memo and every
 * fixture read the nested members, while the application only ever sees the flat
 * wire read.
 *
 * A test that serves a policy, a detail read, a history chain or an attachment
 * list to the application must therefore project too, or it answers a payload the
 * live API would never send — which is precisely the class of defect
 * `eiams-frontend-whhu.19` existed to remove. Building the payload from the
 * generated factories and projecting it here keeps one spelling of "the server's
 * answer" across every suite.
 *
 * These helpers add no fixture data of their own: each one delegates to the
 * canonical factory and then to the harness projection, so a change to either is
 * picked up by every caller at once.
 */

/** Overrides accepted by {@link wirePolicy}, in the LIVE wire vocabulary. */
export type WirePolicyOverrides = Partial<DocumentPolicy>

/**
 * A policy as the live API serves it: `status` / `evaluatedAtUtc` / `warnings`,
 * no `policyKind`, no `documentStatus`, and no `messageAr` anywhere.
 *
 * `actions` are derived from the requested status through the harness's own
 * status map and projected to the wire spelling, so a caller asking for a
 * `Submitted` policy gets the same availability table the API would serve. Every
 * other member is supplied in the wire vocabulary and is taken verbatim: the
 * blockers and warnings a test needs to assert against are the wire records, not
 * the snapshot's `messageAr` projections of them.
 *
 * As in the snapshot factory, a call that names no status gets the lenient
 * action set (everything available) so a bare fixture never blocks by accident.
 */
export function wirePolicy(overrides: WirePolicyOverrides = {}): DocumentPolicy {
  const status = overrides.status ?? 'Draft'
  const signedOriginalSatisfied = overrides.signedOriginalSatisfied ?? false
  const projected = toWirePolicy(
    createWarehouseDocument({
      documentStatus: status,
      policy: createDocumentPolicy({
        documentStatus: status,
        signedOriginalSatisfied,
        blockers: [],
        advisories: [],
      }),
    }),
  )
  return { ...projected, ...overrides }
}

/** The detail read (`WarehouseDocumentDetails`) for an in-memory document. */
export function wireDocumentDetails(
  document: Parameters<typeof toWireDetails>[0],
): WarehouseDocumentDetails {
  return toWireDetails(document)
}

/** One list row (`WarehouseDocumentSummary`) for an in-memory document. */
export function wireDocumentSummary(
  document: Parameters<typeof toWireSummary>[0],
): WarehouseDocumentSummary {
  return toWireSummary(document)
}

/** One history entry (`DocumentLifecycleEvent`) in the wire spelling. */
export function wireLifecycleEvent(
  overrides: FixtureOverrides<GeneratedLifecycleEvent> = {},
): DocumentLifecycleEvent {
  return toWireLifecycleEvent(createLifecycleEvent(overrides))
}

/**
 * The history envelope for a chain of harness events. `currentStatus` and
 * `currentRowVersion` default to the last event, which is what the backend
 * reports for a document that is not being concurrently written.
 */
export function wireDocumentHistory(
  events: readonly GeneratedLifecycleEvent[],
  options: {
    documentId?: string
    currentStatus?: DocumentStatus
    currentRowVersion?: number
  } = {},
): DocumentLifecycleHistory {
  const last = events[events.length - 1]
  return toWireHistory(
    options.documentId ?? last?.documentId ?? '',
    events,
    options.currentStatus ?? last?.toStatus ?? 'Draft',
    options.currentRowVersion ?? last?.documentRowVersion ?? 0,
  )
}

/** One attachment (`DocumentAttachmentResponse`): `id`, never `attachmentId`. */
export function wireAttachment(
  overrides: Parameters<typeof createDocumentAttachment>[0] = {},
): DocumentAttachmentResponse {
  return toWireAttachment(createDocumentAttachment(overrides))
}
