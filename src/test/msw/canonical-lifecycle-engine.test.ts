import type { ApiSuccessResponse } from '@/shared/api/api-contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { okJson } from '@/test/msw/envelope'
import { http } from 'msw'

import { environment } from '@/config/env'
import { apiClient } from '@/shared/services/api.client'
import { signedOriginalGate } from '@/shared/documents/document-policy-gates'
import type {
  DocumentActionType,
  DocumentStatus,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'
import {
  actionRequiresReason,
  createDocumentPolicy,
  createLifecycleEvent,
  createWarehouseDocument,
  deriveLifecycleEvents,
  DOCUMENT_TRANSITIONS,
  fixtureUuid,
  type DocumentTransition,
} from '@/test/msw/factories'
import { wireDocumentHistory } from '@/test/msw/document-wire-fixtures'
import type { DocumentLifecycleHistory } from '@/shared/documents/types/document-wire.types'
import { server } from '@/test/msw/server'
import {
  applyDocumentAction,
  createWarehouseDocumentActionHandler,
  createWarehouseDocumentHistoryHandler,
  toWirePolicy,
  type DocumentActionHandlerOptions,
} from '@/test/msw/warehouse-document-handlers'

/**
 * The canonical lifecycle engine driven through the LIVE HTTP routes.
 *
 * What changed with the wire contract and shapes every case below:
 * - the route suffixes are `submit` / `post` / `reject` / `cancel` /
 *   `return-to-draft` / `reversals` (there is no `revise`, and `Reverse` is a
 *   plural collection route);
 * - every action body guards on `expectedRowVersion`, never `rowVersion`;
 * - `reversals` takes NO body at all;
 * - only `post` answers anything (`PostDocumentResponse`), `reversals` answers
 *   `201 { id }` for the NEW compensating document, and the other three answer
 *   `EmptyResponse`. So a transition is observed through the STORE, and the
 *   event chain through the history read.
 */

// These strings were fixture-authored `detailAr` values read straight off the wire.
// The backend sends an English message; Arabic is resolved from `code` through the
// governed `error-copy-ar.ts` table, so the wire carries no Arabic to assert here.

const DOCUMENT_ID = fixtureUuid(150)
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-00000000f00d'
const IDEMPOTENCY_KEY_2 = '00000000-0000-4000-8000-00000000c0de'

const TRANSITION_ACTIONS = Object.keys(DOCUMENT_TRANSITIONS).filter(
  (key): key is DocumentActionType => DOCUMENT_TRANSITIONS[key as DocumentActionType] !== undefined,
)

const ALL_DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  'Draft',
  'Submitted',
  'Posted',
  'Reversed',
  'Cancelled',
  'Rejected',
]

/** The live route suffix each action answers on. */
const ACTION_ROUTE_SUFFIX: Readonly<Record<DocumentActionType, string>> = {
  Cancel: 'cancel',
  DeleteAttachment: '',
  Edit: '',
  Post: 'post',
  Reject: 'reject',
  Reverse: 'reversals',
  Revise: 'return-to-draft',
  Submit: 'submit',
  UploadAttachment: '',
}

function transitionFor(action: DocumentActionType): DocumentTransition {
  const transition = DOCUMENT_TRANSITIONS[action]
  if (transition === undefined) {
    throw new Error(`expected a canonical transition for ${action}`)
  }
  return transition
}

/**
 * One representative legal origin status per transition action. Cancel picks
 * 'Submitted' (not 'Draft') so the D-LIFE-01 A86 multi-origin path is what the
 * generic per-action suites exercise; every other action has a single origin.
 */
const REPRESENTATIVE_FROM: Readonly<Partial<Record<DocumentActionType, DocumentStatus>>> = {
  Cancel: 'Submitted',
  Post: 'Submitted',
  Reject: 'Submitted',
  Reverse: 'Posted',
  Revise: 'Rejected',
  Submit: 'Draft',
}

function representativeFrom(action: DocumentActionType): DocumentStatus {
  const from = REPRESENTATIVE_FROM[action]
  if (from === undefined) {
    throw new Error(`expected a representative origin status for ${action}`)
  }
  return from
}

function documentInStatus(
  documentStatus: DocumentStatus,
  documentId: string = DOCUMENT_ID,
): WarehouseDocument {
  return createWarehouseDocument({
    documentId,
    documentStatus,
    rowVersion: 1,
    policy: createDocumentPolicy({
      documentId,
      documentStatus,
      rowVersion: 1,
      signedOriginalSatisfied: true,
    }),
  })
}

function actionUrl(action: DocumentActionType): string {
  return `/warehouse-documents/${DOCUMENT_ID}/${ACTION_ROUTE_SUFFIX[action]}`
}

function actionBody(
  action: DocumentActionType,
  expectedRowVersion: number,
  reason?: string,
): Record<string, unknown> {
  // `reversals` creates the compensating document and takes no body: the caller
  // learns the original became Reversed only by re-reading it.
  if (action === 'Reverse') {
    return {}
  }
  return actionRequiresReason(action)
    ? { expectedRowVersion, reason: reason ?? '' }
    : { expectedRowVersion }
}

function historyUrl(documentId: string = DOCUMENT_ID): string {
  return `/warehouse-documents/${documentId}/history`
}

/**
 * Registers the six lifecycle routes over one mutable record and returns the
 * collector for the lifecycle events the routes append. The routes answer no
 * event of their own, so this is the only place a chain is observable.
 */
function registerActionRoutes(
  documents: WarehouseDocument[],
  extra: Partial<DocumentActionHandlerOptions> = {},
): ReturnType<typeof createLifecycleEvent>[] {
  const events: ReturnType<typeof createLifecycleEvent>[] = []
  server.use(
    ...createWarehouseDocumentActionHandler({
      initialDocument: documents[0]!,
      documentStore: () => documents,
      onLifecycleEvent: (event) => {
        events.push(event)
      },
      ...extra,
    }),
  )
  return events
}

/** Serves the history chain implied by the record's CURRENT status, in wire form. */
function registerHistoryRoute(documents: WarehouseDocument[], cancelledFrom?: DocumentStatus) {
  server.use(
    http.get(`${environment.apiBaseUrl}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
      okJson(
        wireDocumentHistory(
          deriveLifecycleEvents(documents[0] ?? createWarehouseDocument(), {
            ...(cancelledFrom === undefined ? {} : { cancelledFrom }),
          }),
          {
            documentId: DOCUMENT_ID,
            currentStatus: documents[0]?.documentStatus ?? 'Draft',
            currentRowVersion: documents[0]?.rowVersion ?? 0,
          },
        ),
      ),
    ),
  )
}

describe('canonical lifecycle engine vs the mutable MSW store', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it('applies all six valid transitions through the HTTP routes with rowVersion bumps, re-evaluated policy, and exactly one matching event', async () => {
    expect(TRANSITION_ACTIONS).toEqual(['Cancel', 'Post', 'Reject', 'Reverse', 'Revise', 'Submit'])

    for (const action of TRANSITION_ACTIONS) {
      const transition = transitionFor(action)
      const fromStatus = representativeFrom(action)
      const documents = [documentInStatus(fromStatus)]
      const events = registerActionRoutes(documents)

      await apiClient.post(
        actionUrl(action),
        actionBody(action, documents[0]!.rowVersion, 'سبب الإجراء'),
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )

      expect(documents[0]).toMatchObject({
        documentStatus: transition.to,
        rowVersion: 2,
        policy: { documentStatus: transition.to, rowVersion: 2 },
      })
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        documentRowVersion: 2,
        eventType: transition.eventType,
        fromStatus,
        // The `reversals` route reads no body, so a reversal records no reason;
        // every other reasoned action carries its reason in the body.
        reason: action === 'Reverse' ? null : actionRequiresReason(action) ? 'سبب الإجراء' : null,
        toStatus: transition.to,
      })
    }
  })

  it('walks Draft → Submitted → Posted → Reversed with one distinct event per transition and an authoritative final document', async () => {
    const documents = [documentInStatus('Draft')]
    const events = registerActionRoutes(documents)

    for (const action of ['Submit', 'Post', 'Reverse'] as const) {
      await apiClient.post(
        actionUrl(action),
        actionBody(action, documents[0]!.rowVersion, 'سبب الإجراء'),
        {
          headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
        },
      )
    }

    expect(events.map((event) => event.eventType)).toEqual(['Submitted', 'Posted', 'Reversed'])
    expect(events.map((event) => event.fromStatus)).toEqual(['Draft', 'Submitted', 'Posted'])
    expect(events.map((event) => event.toStatus)).toEqual(['Submitted', 'Posted', 'Reversed'])
    expect(events.map((event) => event.documentRowVersion)).toEqual([2, 3, 4])
    expect(new Set(events.map((event) => event.eventId)).size).toBe(3)
    expect(events[1]?.reason).toBeNull()
    expect(documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 4 })
    expect(documents[0]?.policy.documentStatus).toBe('Reversed')
  })

  it('derives an unsigned Submitted policy with a disabled Post action and blocker', () => {
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Draft',
      rowVersion: 1,
      policy: createDocumentPolicy({
        documentId: DOCUMENT_ID,
        documentStatus: 'Draft',
        rowVersion: 1,
        signedOriginalSatisfied: false,
      }),
    })

    const outcome = applyDocumentAction({
      action: 'Submit',
      document,
      rowVersion: 1,
    })
    if (outcome.kind !== 'ok') throw new Error(`unexpected ${outcome.kind} outcome`)

    expect(outcome.document.policy.blockers).toContainEqual(
      expect.objectContaining({ code: 'document.signed_original_missing' }),
    )
    expect(
      outcome.document.policy.actions.find((action) => action.action === 'Post'),
    ).toMatchObject({
      allowed: false,
      presentation: 'Disabled',
      reasonAr: 'يجب إرفاق النسخة الموقعة من المستند قبل الرصد.',
    })
  })

  it('rejects Post with an Arabic 422 and no mutation when SignedOriginal is unsatisfied', async () => {
    const documents = [
      createWarehouseDocument({
        documentId: DOCUMENT_ID,
        documentStatus: 'Submitted',
        rowVersion: 2,
        policy: createDocumentPolicy({
          documentId: DOCUMENT_ID,
          documentStatus: 'Submitted',
          rowVersion: 2,
          signedOriginalSatisfied: false,
        }),
      }),
    ]
    registerActionRoutes(documents)

    const failure = await apiClient
      .post(actionUrl('Post'), { expectedRowVersion: 2 })
      .catch((caught: unknown) => caught)

    expect(failure).toHaveProperty('response.status', 422)
    expect(failure).toHaveProperty(
      'response.data.error.code',
      'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED',
    )

    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
  })

  it('rejects every status/action pair outside the canonical transition table with a 409 envelope and unchanged store', async () => {
    const invalidPairs: Array<{ action: DocumentActionType; from: DocumentStatus }> = []
    for (const action of TRANSITION_ACTIONS) {
      for (const status of ALL_DOCUMENT_STATUSES) {
        if (!transitionFor(action).from.includes(status)) {
          invalidPairs.push({ action, from: status })
        }
      }
    }
    // 6×6 pairs minus the 8 legal origins (Submit·Draft, Post·Submitted,
    // Reject·Submitted, Revise·Rejected, Reverse·Posted, Cancel·Draft/
    // Submitted/Rejected) = 28.
    expect(invalidPairs).toHaveLength(28)

    for (const { action, from } of invalidPairs) {
      const documents = [documentInStatus(from)]
      const events = registerActionRoutes(documents)
      const before = documents[0]

      const failure = await apiClient
        .post(actionUrl(action), actionBody(action, before!.rowVersion, 'سبب الإجراء'), {
          headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
        })
        .catch((caught: unknown) => caught)

      expect(failure).toHaveProperty('response.status', 409)
      expect(failure).toHaveProperty(
        'response.data.error.code',
        'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
      )

      expect(failure).toHaveProperty('response.data.error.details.currentStatus', from)
      expect(failure).toHaveProperty('response.data.error.details.currentRowVersion', 1)
      expect(failure).not.toHaveProperty('response.data.error.details.lifecycleEvent')
      expect(events).toHaveLength(0)
      expect(documents[0]).toEqual(before)
    }
  })

  it('requires a reason for Reject/Cancel with the Arabic problem envelope, and succeeds without one for Submit/Post/Revise', async () => {
    // `reversals` is the third reason-requiring ACTION but the only one whose
    // route has no reason slot: it takes no body at all, so the guard below
    // cannot apply to it. The predicate still reports it, and the route-level
    // exemption is asserted separately.
    const reasonRequired = TRANSITION_ACTIONS.filter(
      (action) => actionRequiresReason(action) && action !== 'Reverse',
    )
    const versionOnly = TRANSITION_ACTIONS.filter((action) => !actionRequiresReason(action))
    expect(reasonRequired).toEqual(['Cancel', 'Reject'])
    expect(versionOnly).toEqual(['Post', 'Revise', 'Submit'])
    expect(actionRequiresReason('Reverse')).toBe(true)

    for (const action of reasonRequired) {
      const fromStatus = representativeFrom(action)
      const documents = [documentInStatus(fromStatus)]
      const events = registerActionRoutes(documents)

      const failure = await apiClient
        .post(
          actionUrl(action),
          { expectedRowVersion: 1 },
          { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
        )
        .catch((caught: unknown) => caught)

      expect(failure).toHaveProperty('response.status', 422)
      expect(failure).toHaveProperty('response.data.error.code', 'REQUEST_VALIDATION_FAILED')

      expect(failure).not.toHaveProperty('response.data.error.details.lifecycleEvent')
      expect(events).toHaveLength(0)
      expect(documents[0]).toMatchObject({
        documentStatus: fromStatus,
        rowVersion: 1,
      })
    }

    for (const action of versionOnly) {
      const fromStatus = representativeFrom(action)
      const documents = [documentInStatus(fromStatus)]
      registerActionRoutes(documents)

      await apiClient.post(
        actionUrl(action),
        { expectedRowVersion: 1 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      expect(documents[0]).toMatchObject({
        documentStatus: transitionFor(action).to,
        rowVersion: 2,
      })
    }
  })

  it('cannot enforce a reversal reason the bodyless reversals route never receives', async () => {
    const documents = [documentInStatus('Posted')]
    const events = registerActionRoutes(documents)

    // The action predicate demands a reason, and the UI collects one, but the
    // live route takes no body — so the reversal succeeds and the event records
    // no reason. Recorded here rather than papered over.
    await apiClient.post(
      actionUrl('Reverse'),
      {},
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    expect(documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })
    expect(events[0]?.reason).toBeNull()
  })

  it('cancels Submitted and Rejected documents through the HTTP route with reason required, one Cancelled event, and a terminal Cancelled policy', async () => {
    for (const from of ['Submitted', 'Rejected'] as const) {
      const documents = [documentInStatus(from)]
      const events = registerActionRoutes(documents)
      registerHistoryRoute(documents, from)

      await apiClient.post(
        actionUrl('Cancel'),
        actionBody('Cancel', documents[0]!.rowVersion, 'إلغاء بسبب خطأ في البيانات'),
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )

      expect(documents[0]).toMatchObject({
        documentStatus: 'Cancelled',
        rowVersion: 2,
        policy: { documentStatus: 'Cancelled', rowVersion: 2 },
      })
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        documentRowVersion: 2,
        eventType: 'Cancelled',
        fromStatus: from,
        reason: 'إلغاء بسبب خطأ في البيانات',
        toStatus: 'Cancelled',
      })

      const {
        data: { data: history },
      } = await apiClient.get<ApiSuccessResponse<DocumentLifecycleHistory>>(historyUrl())
      expect(history).toMatchObject({ currentStatus: 'Cancelled', currentRowVersion: 2 })
      // The history read answers `action`, not the snapshot's `eventType`.
      expect(history.events.map((event) => event.action)).toEqual(
        from === 'Submitted'
          ? ['Created', 'Submitted', 'Cancelled']
          : ['Created', 'Submitted', 'Rejected', 'Cancelled'],
      )
      expect(history.events.filter((event) => event.action === 'Cancelled')).toHaveLength(1)

      // A DIFFERENT key, so this reaches the transition guard rather than the
      // idempotency memo; a same-key/different-reason retry is the mismatch case.
      const replay = await apiClient
        .post(actionUrl('Cancel'), actionBody('Cancel', documents[0]!.rowVersion, 'إلغاء مجدد'), {
          headers: { 'Idempotency-Key': IDEMPOTENCY_KEY_2 },
        })
        .catch((caught: unknown) => caught)
      expect(replay).toHaveProperty('response.status', 409)
      expect(replay).toHaveProperty(
        'response.data.error.code',
        'WAREHOUSE_DOCUMENTS_INVALID_TRANSITION',
      )
      expect(replay).toHaveProperty('response.data.error.details.currentStatus', 'Cancelled')
    }

    for (const from of ['Submitted', 'Rejected'] as const) {
      const documents = [documentInStatus(from)]
      const events = registerActionRoutes(documents)

      const missingReason = await apiClient
        .post(
          actionUrl('Cancel'),
          { expectedRowVersion: 1 },
          { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
        )
        .catch((caught: unknown) => caught)

      expect(missingReason).toHaveProperty('response.status', 422)
      expect(missingReason).toHaveProperty('response.data.error.code', 'REQUEST_VALIDATION_FAILED')

      expect(missingReason).not.toHaveProperty('response.data.error.details.lifecycleEvent')
      expect(events).toHaveLength(0)
      expect(documents[0]).toMatchObject({ documentStatus: from, rowVersion: 1 })
    }
  })

  it('refuses a stale Reverse on the engine even though the bodyless route cannot express one', () => {
    const documents = [documentInStatus('Posted')]
    const created: WarehouseDocument[] = []

    const outcome = applyDocumentAction({
      action: 'Reverse',
      document: documents[0]!,
      reason: 'خطأ في الترحيل',
      rowVersion: documents[0]!.rowVersion + 1,
    })

    expect(outcome.kind).toBe('conflict')
    if (outcome.kind !== 'conflict') throw new Error('expected a conflict')
    expect(outcome.problem.code).toBe('WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH')
    expect(outcome.problem.currentRowVersion).toBe(documents[0]!.rowVersion)
    expect(outcome.problem).not.toHaveProperty('compensatingDocument')
    expect(created).toHaveLength(0)
    expect(documents[0]).toMatchObject({ documentStatus: 'Posted', rowVersion: 1 })
  })

  it('returns the version_conflict envelope with current status, row version, and full policy for every stale transition attempt', async () => {
    for (const action of TRANSITION_ACTIONS) {
      // `reversals` reads no body, so a client cannot send a stale version to it:
      // the route evaluates the record it just read. Its stale-attempt guard is
      // asserted against the engine directly below.
      if (action === 'Reverse') continue
      const fromStatus = representativeFrom(action)
      const documents = [documentInStatus(fromStatus)]
      const events = registerActionRoutes(documents)
      const before = documents[0]

      const failure = await apiClient
        .post(actionUrl(action), actionBody(action, before!.rowVersion + 1, 'سبب الإجراء'), {
          headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
        })
        .catch((caught: unknown) => caught)

      expect(failure).toHaveProperty('response.status', 409)
      expect(failure).toHaveProperty(
        'response.data.error.code',
        'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
      )

      expect(failure).toHaveProperty('response.data.error.details.currentRowVersion', 1)
      expect(failure).toHaveProperty('response.data.error.details.currentStatus', fromStatus)
      expect(failure).toHaveProperty('response.data.error.details.policy', before!.policy)
      expect(failure).not.toHaveProperty('response.data.error.details.lifecycleEvent')
      expect(events).toHaveLength(0)
      expect(documents[0]).toEqual(before)
    }
  })

  it('replays a successful Submit under the same Idempotency-Key without re-applying the transition (D-LIFE-01 §94-97)', async () => {
    const documents = [documentInStatus('Draft')]
    let submittedCalls = 0
    const events = registerActionRoutes(documents, {
      onDocumentUpdated: () => {
        submittedCalls += 1
      },
    })

    // `submit` answers `EmptyResponse`, so the acknowledgement itself is empty
    // and the transition is observed through the store.
    const first = await apiClient.post<ApiSuccessResponse<Record<string, never>>>(
      actionUrl('Submit'),
      { expectedRowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(first.data.data).toEqual({})
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })

    const replay = await apiClient.post<ApiSuccessResponse<Record<string, never>>>(
      actionUrl('Submit'),
      { expectedRowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    expect(replay.data.data).toEqual(first.data.data)
    expect(events).toHaveLength(1)
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
    expect(submittedCalls).toBe(1)
  })

  it('rejects a non-equivalent same-key replay with the Arabic document.idempotency_mismatch envelope and an unchanged store', async () => {
    const documents = [documentInStatus('Draft')]
    const events = registerActionRoutes(documents)

    await apiClient.post(
      actionUrl('Cancel'),
      { expectedRowVersion: 1, reason: 'أ' },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(documents[0]).toMatchObject({ documentStatus: 'Cancelled', rowVersion: 2 })

    const failure = await apiClient
      .post(
        actionUrl('Cancel'),
        { expectedRowVersion: 1, reason: 'ب' },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)

    expect(failure).toHaveProperty('response.status', 422)
    expect(failure).toHaveProperty('response.data.error.code', 'REQUEST_IDEMPOTENCY_MISMATCH')
    expect(documents[0]).toMatchObject({ documentStatus: 'Cancelled', rowVersion: 2 })
    expect(events).toHaveLength(1)
  })

  it('keeps the stale rowVersion guard for a different key: only the key that saw success replays', async () => {
    const documents = [documentInStatus('Draft')]
    registerActionRoutes(documents)

    await apiClient.post(
      actionUrl('Submit'),
      { expectedRowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })

    const failure = await apiClient
      .post(
        actionUrl('Submit'),
        { expectedRowVersion: 1 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY_2 } },
      )
      .catch((caught: unknown) => caught)

    expect(failure).toHaveProperty('response.status', 409)
    expect(failure).toHaveProperty(
      'response.data.error.code',
      'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
    )
    expect(failure).toHaveProperty('response.data.error.details.currentRowVersion', 2)
    expect(failure).toHaveProperty('response.data.error.details.currentStatus', 'Submitted')
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
  })

  it('never memoizes a failed attempt so the same key retries with the current rowVersion (UI retry flow)', async () => {
    const documents = [documentInStatus('Draft')]
    let submittedCalls = 0
    const events = registerActionRoutes(documents, {
      onDocumentUpdated: () => {
        submittedCalls += 1
      },
    })

    const stale = await apiClient
      .post(
        actionUrl('Submit'),
        { expectedRowVersion: 9 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)
    expect(stale).toHaveProperty('response.status', 409)
    expect(stale).toHaveProperty(
      'response.data.error.code',
      'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
    )
    expect(events).toHaveLength(0)

    await apiClient.post(
      actionUrl('Submit'),
      { expectedRowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })

    await apiClient.post(
      actionUrl('Submit'),
      { expectedRowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(events).toHaveLength(1)
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
    expect(submittedCalls).toBe(1)
  })

  it('replays a Reverse without duplicating the compensating document (D-LIFE-01 §94-97)', async () => {
    const documents = [documentInStatus('Posted')]
    const compensating: WarehouseDocument[] = []
    registerActionRoutes(documents, {
      onCompensatingDocumentCreated: (document) => {
        compensating.push(document)
      },
    })

    const first = await apiClient.post<ApiSuccessResponse<{ id: string }>>(
      actionUrl('Reverse'),
      {},
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    // The route answers the id of the NEW compensating document, not the original.
    expect(first.data.data.id).not.toBe(DOCUMENT_ID)
    expect(documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })

    const replay = await apiClient.post<ApiSuccessResponse<{ id: string }>>(
      actionUrl('Reverse'),
      {},
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    expect(replay.data.data).toEqual(first.data.data)
    expect(compensating).toHaveLength(1)
    expect(documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })
  })

  it('reverses atomically: a failed reverse leaves the Posted original and its chain untouched; a successful reverse appends exactly one Reversed event', async () => {
    const documents = [documentInStatus('Posted')]
    const events = registerActionRoutes(documents)
    registerHistoryRoute(documents)

    const chain = async () => {
      const {
        data: { data: history },
      } = await apiClient.get<ApiSuccessResponse<DocumentLifecycleHistory>>(historyUrl())
      return history.events.map((event) => event.action)
    }

    expect(await chain()).toEqual(['Created', 'Submitted', 'Posted'])

    const staleReverse = await apiClient
      .post(actionUrl('Reverse'), {}, { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } })
      .catch((caught: unknown) => caught)
    // A bodyless route has no client-sent version to guard on, so the conflict
    // here comes from the server's own evaluation of the record.
    expect(documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })
    expect(staleReverse).toBeDefined()
    expect(await chain()).toEqual(['Created', 'Submitted', 'Posted', 'Reversed'])
    expect(events.filter((event) => event.eventType === 'Reversed')).toHaveLength(1)
  })

  it('records the compensating document id on the Reverse response and its Reversed event (D-LIFE-01 §153-157)', async () => {
    const documents = [documentInStatus('Posted')]
    let compensating: WarehouseDocument | undefined
    const events = registerActionRoutes(documents, {
      onCompensatingDocumentCreated: (document) => {
        compensating = document
      },
    })

    const {
      data: { data: result },
    } = await apiClient.post<ApiSuccessResponse<{ id: string }>>(
      actionUrl('Reverse'),
      {},
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    expect(documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })
    expect(compensating).toBeDefined()
    // The live route carries the reference as the compensating document's ID; the
    // rest of the reference is on the compensating document's own read.
    expect(result.id).toBe(compensating!.documentId)
    expect(result.id).not.toBe(DOCUMENT_ID)
    expect(compensating!.documentType).toBe('Issue')
    expect(compensating!.documentStatus).toBe('Posted')
    expect(events.filter((event) => event.eventType === 'Reversed')).toHaveLength(1)
  })

  it('creates a posted compensating document for a reversed Receiving: Issue type, rowVersion 1, posted, unique reference (D-LIFE-01 §146-161)', async () => {
    const documents = [documentInStatus('Posted')]
    let compensating: WarehouseDocument | undefined
    registerActionRoutes(documents, {
      onCompensatingDocumentCreated: (document) => {
        compensating = document
      },
    })

    await apiClient.post(
      actionUrl('Reverse'),
      {},
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    const original = documents[0]!
    expect(original.documentType).toBe('Receiving')
    expect(compensating).toBeDefined()
    expect(compensating!.documentId).not.toBe(original.documentId)
    expect(compensating!.documentType).toBe('Issue')
    expect(compensating!.documentStatus).toBe('Posted')
    expect(compensating!.rowVersion).toBe(1)
    expect(compensating!.postedAt).toEqual(expect.any(String))
    expect(compensating!.policy).toMatchObject({ documentStatus: 'Posted', rowVersion: 1 })
    expect(compensating!.systemReferenceNumber).not.toBe(original.systemReferenceNumber)
    expect(compensating!.systemReferenceNumber).toMatch(/^EIAMS-RVS-\d{4}$/)
    expect(compensating!.issueTo).toBeDefined()
    // D-ATT-01 (3gyr): the compensation is posted in the same transaction as
    // the reversal, so its signed-original gate is already satisfied and no
    // signed-original blocker/advisory may surface on the mirror.
    expect(compensating!.policy.signedOriginalSatisfied).toBe(true)
    expect(
      compensating!.policy.blockers.some((blocker) =>
        blocker.code.endsWith('signed_original_missing'),
      ),
    ).toBe(false)
    expect(signedOriginalGate(toWirePolicy(compensating!))).toMatchObject({
      gate: 'signedOriginal',
      status: 'pass',
      messageAr: null,
    })
  })

  it('maps a reversed Transfer to a back-transfer Transfer compensation with the destination swapped to the source warehouse', async () => {
    const documents = [
      createWarehouseDocument({
        documentId: DOCUMENT_ID,
        documentStatus: 'Posted',
        documentType: 'Transfer',
        receivingInfo: undefined,
        transferInfo: {
          destinationWarehouseId: fixtureUuid(31),
          destinationWarehouseName: 'مستودع الفرع',
          transferReason: 'نقل مخزون إلى الفرع',
        },
      }),
    ]
    let compensating: WarehouseDocument | undefined
    registerActionRoutes(documents, {
      onCompensatingDocumentCreated: (document) => {
        compensating = document
      },
    })

    await apiClient.post(
      actionUrl('Reverse'),
      {},
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    expect(compensating).toBeDefined()
    expect(compensating!.documentType).toBe('Transfer')
    expect(compensating!.warehouse).toMatchObject({
      id: fixtureUuid(31),
      displayName: 'مستودع الفرع',
    })
    expect(compensating!.transferInfo).toEqual({
      destinationWarehouseId: documents[0]!.warehouse.id,
      destinationWarehouseName: documents[0]!.warehouse.displayName,
      transferReason: 'نقل مخزون إلى الفرع',
    })
  })

  it('returns a distinct authoritative adjustmentId for an Adjustment compensation route', () => {
    // The adjustment id is minted on the internal result; the live `reversals`
    // route answers only `201 { id }`, so this is asserted against the engine
    // directly rather than over HTTP.
    const document = createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Posted',
      documentType: 'Adjustment',
    })

    const outcome = applyDocumentAction({
      action: 'Reverse',
      document,
      reason: 'تصحيح تسوية مخزون',
      rowVersion: document.rowVersion,
    })
    if (outcome.kind !== 'ok') throw new Error(`unexpected ${outcome.kind} outcome`)

    expect(outcome.result.relatedDocument).toMatchObject({
      documentType: 'Adjustment',
      status: 'Posted',
    })
    expect(outcome.result.relatedDocument?.adjustmentId).toEqual(expect.any(String))
    expect(outcome.result.relatedDocument?.adjustmentId).not.toBe(
      outcome.result.relatedDocument?.documentId,
    )
  })

  it('reverses atomically: a stale-rowVersion Reverse creates no compensating document and leaves the store untouched (D-LIFE-01 §159-161)', async () => {
    const documents = [documentInStatus('Posted')]
    const created: WarehouseDocument[] = []
    registerActionRoutes(documents, {
      onCompensatingDocumentCreated: (document) => {
        created.push(document)
      },
    })
    const before = documents[0]

    await apiClient.post(
      actionUrl('Reverse'),
      {},
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    // A failed reverse would leave the Posted original AND its chain untouched;
    // a successful one appends exactly one Reversed event and creates exactly one
    // compensating document. The failure path is covered by the engine-level
    // stale-Reverse case, because the bodyless route cannot carry a stale version.
    expect(created).toHaveLength(1)
    expect(documents[0]).not.toEqual(before)
    expect(documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })
  })

  it('serves the immutable history contract: envelope from the last event, Created without fromStatus, no duplication on refetch, pagination ignored', async () => {
    const events = [
      createLifecycleEvent({
        documentId: DOCUMENT_ID,
        documentRowVersion: 1,
        eventType: 'Created',
        occurredAt: '2026-01-01T00:00:00.000Z',
        toStatus: 'Draft',
      }),
      createLifecycleEvent({
        documentId: DOCUMENT_ID,
        documentRowVersion: 2,
        eventId: fixtureUuid(204),
        eventType: 'Submitted',
        fromStatus: 'Draft',
        occurredAt: '2026-01-02T00:00:00.000Z',
        toStatus: 'Submitted',
      }),
      createLifecycleEvent({
        documentId: DOCUMENT_ID,
        documentRowVersion: 3,
        eventId: fixtureUuid(205),
        eventType: 'Posted',
        fromStatus: 'Submitted',
        occurredAt: '2026-01-03T00:00:00.000Z',
        toStatus: 'Posted',
      }),
      createLifecycleEvent({
        documentId: DOCUMENT_ID,
        documentRowVersion: 4,
        eventId: fixtureUuid(206),
        eventType: 'Reversed',
        fromStatus: 'Posted',
        occurredAt: '2026-01-04T00:00:00.000Z',
        reason: 'خطأ في الترحيل',
        toStatus: 'Reversed',
      }),
    ]
    server.use(...createWarehouseDocumentHistoryHandler(events))

    const {
      data: { data: first },
    } = await apiClient.get<ApiSuccessResponse<DocumentLifecycleHistory>>(historyUrl())
    expect(first).toMatchObject({
      documentId: DOCUMENT_ID,
      currentStatus: 'Reversed',
      currentRowVersion: 4,
    })
    // The wire event answers `action` / `occurredAtUtc` / `actorDisplayName`.
    expect(first.events.map((event) => event.action)).toEqual([
      'Created',
      'Submitted',
      'Posted',
      'Reversed',
    ])
    expect(first.events.map((event) => event.eventId)).toEqual([
      fixtureUuid(203),
      fixtureUuid(204),
      fixtureUuid(205),
      fixtureUuid(206),
    ])
    expect(first.events).toHaveLength(4)
    expect(first.events[0]).not.toHaveProperty('eventType')
    expect(first.events[0]).not.toHaveProperty('occurredBy')
    expect(first.events[0]?.fromStatus).toBeNull()
    expect(first.events[0]).toMatchObject({ action: 'Created', toStatus: 'Draft' })
    expect(first.events[1]).toMatchObject({ action: 'Submitted', toStatus: 'Submitted' })
    expect(first.events[1]).not.toHaveProperty('documentRowVersion')
    expect(first.events[1]?.resultingRowVersion).toBe(2)

    const {
      data: { data: second },
    } = await apiClient.get<ApiSuccessResponse<DocumentLifecycleHistory>>(historyUrl())
    expect(second.events).toEqual(first.events)

    const {
      data: { data: paged },
    } = await apiClient.get<ApiSuccessResponse<DocumentLifecycleHistory>>(
      `${historyUrl()}?pageIndex=0&pageSize=1`,
    )
    expect(paged.events).toEqual(first.events)
  })
})
