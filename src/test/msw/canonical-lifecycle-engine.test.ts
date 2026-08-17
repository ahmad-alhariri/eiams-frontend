import { beforeEach, describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'

import { environment } from '@/config/env'
import { apiClient } from '@/shared/services/api.client'
import type {
  DocumentActionType,
  DocumentActionResult,
  DocumentLifecycleEvent,
  DocumentLifecycleHistory,
  DocumentStatus,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'
import {
  actionRequiresReason,
  createLifecycleEvent,
  createWarehouseDocument,
  deriveLifecycleEvents,
  DOCUMENT_TRANSITIONS,
  fixtureUuid,
  type DocumentTransition,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import {
  createWarehouseDocumentActionHandler,
  createWarehouseDocumentHistoryHandler,
} from '@/test/msw/warehouse-document-handlers'

const DOCUMENT_ID = fixtureUuid(150)
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-00000000f00d'

const REASON_REQUIRED_DETAIL_AR = 'يرجى إدخال سبب الإجراء.'
const VERSION_CONFLICT_DETAIL_AR =
  'تعذر تنفيذ الإجراء: المستند عدَّله مستخدم آخر. أعد تحميل البيانات وحاول مجدداً.'

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

function transitionFor(action: DocumentActionType): DocumentTransition {
  const transition = DOCUMENT_TRANSITIONS[action]
  if (transition === undefined) {
    throw new Error(`expected a canonical transition for ${action}`)
  }
  return transition
}

function documentInStatus(
  documentStatus: DocumentStatus,
  documentId: string = DOCUMENT_ID,
): WarehouseDocument {
  return createWarehouseDocument({ documentId, documentStatus, rowVersion: 1 })
}

function actionUrl(action: DocumentActionType): string {
  return `/warehouse-documents/${DOCUMENT_ID}/${action.toLowerCase()}`
}

function actionBody(action: DocumentActionType, rowVersion: number, reason?: string) {
  return actionRequiresReason(action) ? { reason: reason ?? '', rowVersion } : { rowVersion }
}

function historyUrl(documentId: string = DOCUMENT_ID): string {
  return `/warehouse-documents/${documentId}/history`
}

describe('canonical lifecycle engine vs the mutable MSW store', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it('applies all six valid transitions through the HTTP routes with rowVersion bumps, re-evaluated policy, and exactly one matching event', async () => {
    expect(TRANSITION_ACTIONS).toEqual(['Cancel', 'Post', 'Reject', 'Reverse', 'Revise', 'Submit'])

    for (const action of TRANSITION_ACTIONS) {
      const transition = transitionFor(action)
      const documents = [documentInStatus(transition.from)]
      server.use(
        ...createWarehouseDocumentActionHandler({
          initialDocument: documents[0]!,
          documentStore: () => documents,
        }),
      )

      const { data: result } = await apiClient.post<DocumentActionResult>(
        actionUrl(action),
        actionBody(action, documents[0]!.rowVersion, 'سبب الإجراء'),
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )

      expect(result.document).toMatchObject({
        documentStatus: transition.to,
        rowVersion: 2,
        policy: { documentStatus: transition.to, rowVersion: 2 },
      })
      expect(result.lifecycleEvent).toMatchObject({
        eventType: transition.eventType,
        fromStatus: transition.from,
        toStatus: transition.to,
        documentRowVersion: 2,
        reason: actionRequiresReason(action) ? 'سبب الإجراء' : null,
      })
      expect(documents[0]).toEqual(result.document)
    }
  })

  it('walks Draft → Submitted → Posted → Reversed with one distinct event per transition and an authoritative final document', async () => {
    const documents = [documentInStatus('Draft')]
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
      }),
    )

    const events: DocumentLifecycleEvent[] = []
    for (const action of ['Submit', 'Post', 'Reverse'] as const) {
      const { data: result } = await apiClient.post<DocumentActionResult>(
        actionUrl(action),
        actionBody(action, documents[0]!.rowVersion, 'سبب الإجراء'),
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      events.push(result.lifecycleEvent)
    }

    expect(events.map((event) => event.eventType)).toEqual(['Submitted', 'Posted', 'Reversed'])
    expect(events.map((event) => event.fromStatus)).toEqual(['Draft', 'Submitted', 'Posted'])
    expect(events.map((event) => event.toStatus)).toEqual(['Submitted', 'Posted', 'Reversed'])
    expect(events.map((event) => event.documentRowVersion)).toEqual([2, 3, 4])
    expect(new Set(events.map((event) => event.eventId)).size).toBe(3)
    expect(events[2]?.reason).toBe('سبب الإجراء')
    expect(documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 4 })
    expect(documents[0]?.policy.documentStatus).toBe('Reversed')
  })

  it('rejects every status/action pair outside the canonical transition table with a 409 envelope and unchanged store', async () => {
    const invalidPairs: Array<{ action: DocumentActionType; from: DocumentStatus }> = []
    for (const action of TRANSITION_ACTIONS) {
      for (const status of ALL_DOCUMENT_STATUSES) {
        if (transitionFor(action).from !== status) {
          invalidPairs.push({ action, from: status })
        }
      }
    }
    expect(invalidPairs).toHaveLength(30)

    for (const { action, from } of invalidPairs) {
      const documents = [documentInStatus(from)]
      server.use(
        ...createWarehouseDocumentActionHandler({
          initialDocument: documents[0]!,
          documentStore: () => documents,
        }),
      )
      const before = documents[0]

      const failure = await apiClient
        .post(actionUrl(action), actionBody(action, before!.rowVersion, 'سبب الإجراء'), {
          headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
        })
        .catch((caught: unknown) => caught)

      expect(failure).toHaveProperty('response.status', 409)
      expect(failure).toHaveProperty('response.data.code', 'document.action_not_allowed')
      expect(failure).toHaveProperty(
        'response.data.detailAr',
        `لا يمكن تنفيذ إجراء «${action}» في الحالة «${from}» الحالية للمستند.`,
      )
      expect(failure).toHaveProperty('response.data.currentStatus', from)
      expect(failure).toHaveProperty('response.data.currentRowVersion', 1)
      expect(failure).toHaveProperty('response.data.policy', before!.policy)
      expect(failure).not.toHaveProperty('response.data.lifecycleEvent')
      expect(documents[0]).toEqual(before)
    }
  })

  it('requires a reason for Reject/Cancel/Reverse with the Arabic problem envelope and succeeds without one for Submit/Post/Revise', async () => {
    const reasonRequired = TRANSITION_ACTIONS.filter((action) => actionRequiresReason(action))
    const versionOnly = TRANSITION_ACTIONS.filter((action) => !actionRequiresReason(action))
    expect(reasonRequired).toEqual(['Cancel', 'Reject', 'Reverse'])
    expect(versionOnly).toEqual(['Post', 'Revise', 'Submit'])

    for (const action of reasonRequired) {
      const documents = [documentInStatus(transitionFor(action).from)]
      server.use(
        ...createWarehouseDocumentActionHandler({
          initialDocument: documents[0]!,
          documentStore: () => documents,
        }),
      )

      const failure = await apiClient
        .post(
          actionUrl(action),
          { rowVersion: 1 },
          { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
        )
        .catch((caught: unknown) => caught)

      expect(failure).toHaveProperty('response.status', 422)
      expect(failure).toHaveProperty('response.data.code', 'document.reason_required')
      expect(failure).toHaveProperty('response.data.detailAr', REASON_REQUIRED_DETAIL_AR)
      expect(failure).toHaveProperty('response.data.fieldErrors', [
        { code: 'document.reason_required', field: 'reason', messageAr: REASON_REQUIRED_DETAIL_AR },
      ])
      expect(failure).not.toHaveProperty('response.data.lifecycleEvent')
      expect(documents[0]).toMatchObject({
        documentStatus: transitionFor(action).from,
        rowVersion: 1,
      })
    }

    for (const action of versionOnly) {
      const documents = [documentInStatus(transitionFor(action).from)]
      server.use(
        ...createWarehouseDocumentActionHandler({
          initialDocument: documents[0]!,
          documentStore: () => documents,
        }),
      )

      const { data: result } = await apiClient.post<DocumentActionResult>(
        actionUrl(action),
        { rowVersion: 1 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      expect(result.document).toMatchObject({
        documentStatus: transitionFor(action).to,
        rowVersion: 2,
      })
    }
  })

  it('returns the version_conflict envelope with current status, row version, and full policy for every stale transition attempt', async () => {
    for (const action of TRANSITION_ACTIONS) {
      const transition = transitionFor(action)
      const documents = [documentInStatus(transition.from)]
      server.use(
        ...createWarehouseDocumentActionHandler({
          initialDocument: documents[0]!,
          documentStore: () => documents,
        }),
      )
      const before = documents[0]

      const failure = await apiClient
        .post(actionUrl(action), actionBody(action, before!.rowVersion + 1, 'سبب الإجراء'), {
          headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
        })
        .catch((caught: unknown) => caught)

      expect(failure).toHaveProperty('response.status', 409)
      expect(failure).toHaveProperty('response.data.code', 'document.version_conflict')
      expect(failure).toHaveProperty('response.data.detailAr', VERSION_CONFLICT_DETAIL_AR)
      expect(failure).toHaveProperty('response.data.currentRowVersion', 1)
      expect(failure).toHaveProperty('response.data.currentStatus', transition.from)
      expect(failure).toHaveProperty('response.data.policy', before!.policy)
      expect(failure).not.toHaveProperty('response.data.lifecycleEvent')
      expect(documents[0]).toEqual(before)
    }
  })

  it('replays the same Idempotency-Key as a 409 conflict instead of the original result (known gap vs D-LIFE-01 §94-97)', async () => {
    const documents = [documentInStatus('Draft')]
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
      }),
    )

    const { data: first } = await apiClient.post<DocumentActionResult>(
      actionUrl('Submit'),
      { rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(first.document).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })

    const replay = await apiClient
      .post(
        actionUrl('Submit'),
        { rowVersion: 1 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)

    expect(replay).toHaveProperty('response.status', 409)
    expect(replay).toHaveProperty('response.data.code', 'document.version_conflict')
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
  })

  it('reverses atomically: a failed reverse leaves the Posted original and its chain untouched; a successful reverse appends exactly one Reversed event', async () => {
    const documents = [documentInStatus('Posted')]
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
      }),
      http.get(`${environment.apiBaseUrl}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json({
          documentId: DOCUMENT_ID,
          currentStatus: documents[0]?.documentStatus ?? 'Draft',
          currentRowVersion: documents[0]?.rowVersion ?? 0,
          events: deriveLifecycleEvents(documents[0] ?? createWarehouseDocument()),
        }),
      ),
    )

    const chain = async () => {
      const { data: history } = await apiClient.get<DocumentLifecycleHistory>(historyUrl())
      return history.events.map((event) => event.eventType)
    }

    expect(await chain()).toEqual(['Created', 'Submitted', 'Posted'])

    const staleReverse = await apiClient
      .post(
        actionUrl('Reverse'),
        { reason: 'خطأ في الترحيل', rowVersion: 2 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)
    expect(staleReverse).toHaveProperty('response.status', 409)
    expect(staleReverse).toHaveProperty('response.data.code', 'document.version_conflict')
    expect(documents[0]).toMatchObject({ documentStatus: 'Posted', rowVersion: 1 })
    expect(await chain()).toEqual(['Created', 'Submitted', 'Posted'])

    const { data: reversed } = await apiClient.post<DocumentActionResult>(
      actionUrl('Reverse'),
      { reason: 'خطأ في الترحيل', rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(reversed.document).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })
    expect(reversed.lifecycleEvent).toMatchObject({
      eventType: 'Reversed',
      fromStatus: 'Posted',
      toStatus: 'Reversed',
      documentRowVersion: 2,
      reason: 'خطأ في الترحيل',
    })
    expect(documents[0]).toEqual(reversed.document)

    const { data: afterSuccess } = await apiClient.get<DocumentLifecycleHistory>(historyUrl())
    expect(afterSuccess).toMatchObject({ currentStatus: 'Reversed', currentRowVersion: 2 })
    expect(afterSuccess.events.map((event) => event.eventType)).toEqual([
      'Created',
      'Submitted',
      'Posted',
      'Reversed',
    ])
    expect(afterSuccess.events.filter((event) => event.eventType === 'Reversed')).toHaveLength(1)
  })

  it('omits the compensating relatedDocument from the Reverse action result (known gap vs D-LIFE-01 §153-157)', async () => {
    const documents = [documentInStatus('Posted')]
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
      }),
    )

    const { data: result } = await apiClient.post<DocumentActionResult>(
      actionUrl('Reverse'),
      { reason: 'خطأ في الترحيل', rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(result.document).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })
    expect(result.relatedDocument).toBeUndefined()
    expect(result.lifecycleEvent.relatedDocument).toBeUndefined()
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

    const { data: first } = await apiClient.get<DocumentLifecycleHistory>(historyUrl())
    expect(first).toMatchObject({
      documentId: DOCUMENT_ID,
      currentStatus: 'Reversed',
      currentRowVersion: 4,
    })
    expect(first.events.map((event) => event.eventType)).toEqual([
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
    expect(first.events[0]).not.toHaveProperty('fromStatus')
    expect(first.events[0]).toMatchObject({ eventType: 'Created', toStatus: 'Draft' })
    expect(first.events[1]).toMatchObject({ fromStatus: 'Draft', toStatus: 'Submitted' })

    const { data: second } = await apiClient.get<DocumentLifecycleHistory>(historyUrl())
    expect(second.events).toEqual(first.events)

    const { data: paged } = await apiClient.get<DocumentLifecycleHistory>(
      `${historyUrl()}?pageIndex=0&pageSize=1`,
    )
    expect(paged.events).toEqual(first.events)
  })
})
