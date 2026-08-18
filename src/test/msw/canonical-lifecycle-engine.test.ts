import { beforeEach, describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'

import { environment } from '@/config/env'
import { apiClient } from '@/shared/services/api.client'
import { signedOriginalGate } from '@/shared/documents/document-policy-gates'
import type {
  DocumentActionType,
  DocumentActionResult,
  DocumentLifecycleEvent,
  DocumentLifecycleHistory,
  DocumentStatus,
  LifecycleDocumentReference,
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
const IDEMPOTENCY_KEY_2 = '00000000-0000-4000-8000-00000000c0de'

const REASON_REQUIRED_DETAIL_AR = 'يرجى إدخال سبب الإجراء.'
const VERSION_CONFLICT_DETAIL_AR =
  'تعذر تنفيذ الإجراء: المستند عدَّله مستخدم آخر. أعد تحميل البيانات وحاول مجدداً.'
const IDEMPOTENCY_MISMATCH_DETAIL_AR =
  'لا يمكن إعادة استخدام مفتاح التكرار مع طلب مختلف عن الطلب الأصلي.'

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

/**
 * One representative legal origin status per transition action. Cancel picks
 * 'Submitted' (not 'Draft') so the D-LIFE-01 §86 multi-origin path is what the
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
      const fromStatus = representativeFrom(action)
      const documents = [documentInStatus(fromStatus)]
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
        fromStatus,
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
      const fromStatus = representativeFrom(action)
      const documents = [documentInStatus(fromStatus)]
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
        documentStatus: fromStatus,
        rowVersion: 1,
      })
    }

    for (const action of versionOnly) {
      const fromStatus = representativeFrom(action)
      const documents = [documentInStatus(fromStatus)]
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

  it('cancels Submitted and Rejected documents through the HTTP route with reason required, one Cancelled event, and a terminal Cancelled policy', async () => {
    for (const from of ['Submitted', 'Rejected'] as const) {
      const documents = [documentInStatus(from)]
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
            events: deriveLifecycleEvents(documents[0] ?? createWarehouseDocument(), {
              cancelledFrom: from,
            }),
          }),
        ),
      )

      const { data: result } = await apiClient.post<DocumentActionResult>(
        actionUrl('Cancel'),
        actionBody('Cancel', documents[0]!.rowVersion, 'إلغاء بسبب خطأ في البيانات'),
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )

      expect(result.document).toMatchObject({
        documentStatus: 'Cancelled',
        rowVersion: 2,
        policy: { documentStatus: 'Cancelled', rowVersion: 2 },
      })
      expect(result.lifecycleEvent).toMatchObject({
        eventType: 'Cancelled',
        fromStatus: from,
        toStatus: 'Cancelled',
        documentRowVersion: 2,
        reason: 'إلغاء بسبب خطأ في البيانات',
      })
      expect(documents[0]).toEqual(result.document)

      const { data: history } = await apiClient.get<DocumentLifecycleHistory>(historyUrl())
      expect(history).toMatchObject({ currentStatus: 'Cancelled', currentRowVersion: 2 })
      expect(history.events.map((event) => event.eventType)).toEqual(
        from === 'Submitted'
          ? ['Created', 'Submitted', 'Cancelled']
          : ['Created', 'Submitted', 'Rejected', 'Cancelled'],
      )
      expect(history.events.filter((event) => event.eventType === 'Cancelled')).toHaveLength(1)

      const cancelled = [documents[0]!]
      server.use(
        ...createWarehouseDocumentActionHandler({
          initialDocument: cancelled[0]!,
          documentStore: () => cancelled,
        }),
      )
      const replay = await apiClient
        .post(actionUrl('Cancel'), actionBody('Cancel', cancelled[0]!.rowVersion, 'إلغاء مجدد'), {
          headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
        })
        .catch((caught: unknown) => caught)
      expect(replay).toHaveProperty('response.status', 409)
      expect(replay).toHaveProperty('response.data.code', 'document.action_not_allowed')
      expect(replay).toHaveProperty('response.data.currentStatus', 'Cancelled')
    }

    for (const from of ['Submitted', 'Rejected'] as const) {
      const documents = [documentInStatus(from)]
      server.use(
        ...createWarehouseDocumentActionHandler({
          initialDocument: documents[0]!,
          documentStore: () => documents,
        }),
      )

      const missingReason = await apiClient
        .post(
          actionUrl('Cancel'),
          { rowVersion: 1 },
          { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
        )
        .catch((caught: unknown) => caught)

      expect(missingReason).toHaveProperty('response.status', 422)
      expect(missingReason).toHaveProperty('response.data.code', 'document.reason_required')
      expect(missingReason).toHaveProperty('response.data.detailAr', REASON_REQUIRED_DETAIL_AR)
      expect(missingReason).not.toHaveProperty('response.data.lifecycleEvent')
      expect(documents[0]).toMatchObject({ documentStatus: from, rowVersion: 1 })
    }
  })

  it('returns the version_conflict envelope with current status, row version, and full policy for every stale transition attempt', async () => {
    for (const action of TRANSITION_ACTIONS) {
      const fromStatus = representativeFrom(action)
      const documents = [documentInStatus(fromStatus)]
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
      expect(failure).toHaveProperty('response.data.currentStatus', fromStatus)
      expect(failure).toHaveProperty('response.data.policy', before!.policy)
      expect(failure).not.toHaveProperty('response.data.lifecycleEvent')
      expect(documents[0]).toEqual(before)
    }
  })

  it('replays a successful Submit with the same Idempotency-Key as the byte-identical original result (D-LIFE-01 §94-97)', async () => {
    const documents = [documentInStatus('Draft')]
    let submittedCalls = 0
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
        onDocumentUpdated: () => {
          submittedCalls += 1
        },
      }),
    )

    const { data: first } = await apiClient.post<DocumentActionResult>(
      actionUrl('Submit'),
      { rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(first.document).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })

    const { data: replay } = await apiClient.post<DocumentActionResult>(
      actionUrl('Submit'),
      { rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    expect(replay).toEqual(first)
    expect(replay.lifecycleEvent.eventId).toBe(first.lifecycleEvent.eventId)
    expect(replay.document).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
    expect(submittedCalls).toBe(1)
  })

  it('rejects a non-equivalent same-key replay with the Arabic document.idempotency_mismatch envelope and an unchanged store', async () => {
    const documents = [documentInStatus('Draft')]
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
      }),
    )

    const { data: first } = await apiClient.post<DocumentActionResult>(
      actionUrl('Cancel'),
      { reason: 'أ', rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(first.document).toMatchObject({ documentStatus: 'Cancelled', rowVersion: 2 })

    const failure = await apiClient
      .post(
        actionUrl('Cancel'),
        { reason: 'ب', rowVersion: 1 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)

    expect(failure).toHaveProperty('response.status', 422)
    expect(failure).toHaveProperty('response.data.code', 'document.idempotency_mismatch')
    expect(failure).toHaveProperty('response.data.detailAr', IDEMPOTENCY_MISMATCH_DETAIL_AR)
    expect(failure).toHaveProperty('response.data.fieldErrors', [
      {
        code: 'document.idempotency_mismatch',
        field: 'idempotencyKey',
        messageAr: IDEMPOTENCY_MISMATCH_DETAIL_AR,
      },
    ])
    expect(documents[0]).toMatchObject({ documentStatus: 'Cancelled', rowVersion: 2 })
  })

  it('keeps the stale rowVersion guard for a different key: only the key that saw success replays', async () => {
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

    const failure = await apiClient
      .post(
        actionUrl('Submit'),
        { rowVersion: 1 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY_2 } },
      )
      .catch((caught: unknown) => caught)

    expect(failure).toHaveProperty('response.status', 409)
    expect(failure).toHaveProperty('response.data.code', 'document.version_conflict')
    expect(failure).toHaveProperty('response.data.currentRowVersion', 2)
    expect(failure).toHaveProperty('response.data.currentStatus', 'Submitted')
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
  })

  it('never memoizes a failed attempt so the same key retries with the current rowVersion (UI retry flow)', async () => {
    const documents = [documentInStatus('Draft')]
    let submittedCalls = 0
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
        onDocumentUpdated: () => {
          submittedCalls += 1
        },
      }),
    )

    const stale = await apiClient
      .post(
        actionUrl('Submit'),
        { rowVersion: 9 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)
    expect(stale).toHaveProperty('response.status', 409)
    expect(stale).toHaveProperty('response.data.code', 'document.version_conflict')

    const { data: retry } = await apiClient.post<DocumentActionResult>(
      actionUrl('Submit'),
      { rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(retry.document).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })

    const { data: replay } = await apiClient.post<DocumentActionResult>(
      actionUrl('Submit'),
      { rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(replay).toEqual(retry)
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })
    expect(submittedCalls).toBe(1)
  })

  it('replays a Reverse without duplicating the compensating document (D-LIFE-01 §94-97)', async () => {
    const documents = [documentInStatus('Posted')]
    const compensating: WarehouseDocument[] = []
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
        onCompensatingDocumentCreated: (document) => {
          compensating.push(document)
        },
      }),
    )

    const { data: first } = await apiClient.post<DocumentActionResult>(
      actionUrl('Reverse'),
      { reason: 'خطأ في الترحيل', rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(first.relatedDocument).toBeDefined()
    expect(first.document).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })

    const { data: replay } = await apiClient.post<DocumentActionResult>(
      actionUrl('Reverse'),
      { reason: 'خطأ في الترحيل', rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    expect(replay).toEqual(first)
    expect(replay.relatedDocument).toEqual(first.relatedDocument)
    expect(compensating).toHaveLength(1)
    expect(documents[0]).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })
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

  it('returns the compensating relatedDocument on the Reverse action result and its Reversed event (D-LIFE-01 §153-157)', async () => {
    const documents = [documentInStatus('Posted')]
    let compensating: WarehouseDocument | undefined
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
        onCompensatingDocumentCreated: (document) => {
          compensating = document
        },
      }),
    )

    const { data: result } = await apiClient.post<DocumentActionResult>(
      actionUrl('Reverse'),
      { reason: 'خطأ في الترحيل', rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )

    expect(result.document).toMatchObject({ documentStatus: 'Reversed', rowVersion: 2 })
    expect(compensating).toBeDefined()
    const reference: LifecycleDocumentReference = {
      documentId: compensating!.documentId,
      documentType: compensating!.documentType,
      status: 'Posted',
      systemReferenceNumber: compensating!.systemReferenceNumber,
    }
    expect(result.relatedDocument).toEqual(reference)
    expect(result.lifecycleEvent.relatedDocument).toEqual(reference)
    expect(result.relatedDocument?.documentId).not.toBe(DOCUMENT_ID)
    expect(result.relatedDocument?.documentType).toBe('Issue')
    expect(result.relatedDocument?.status).toBe('Posted')
    expect(result.relatedDocument?.systemReferenceNumber).toMatch(/^EIAMS-RVS-\d{4}$/)
  })

  it('creates a posted compensating document for a reversed Receiving: Issue type, rowVersion 1, posted, unique reference (D-LIFE-01 §146-161)', async () => {
    const documents = [documentInStatus('Posted')]
    let compensating: WarehouseDocument | undefined
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
        onCompensatingDocumentCreated: (document) => {
          compensating = document
        },
      }),
    )

    const { data: result } = await apiClient.post<DocumentActionResult>(
      actionUrl('Reverse'),
      { reason: 'خطأ في الترحيل', rowVersion: 1 },
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
    expect(signedOriginalGate(compensating!.policy)).toMatchObject({
      gate: 'signedOriginal',
      status: 'pass',
      messageAr: null,
    })
    expect(result.relatedDocument).toEqual({
      documentId: compensating!.documentId,
      documentType: compensating!.documentType,
      status: 'Posted',
      systemReferenceNumber: compensating!.systemReferenceNumber,
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
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
        onCompensatingDocumentCreated: (document) => {
          compensating = document
        },
      }),
    )

    const { data: result } = await apiClient.post<DocumentActionResult>(
      actionUrl('Reverse'),
      { reason: 'خطأ في الترحيل', rowVersion: 1 },
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
    expect(result.relatedDocument).toMatchObject({
      documentType: 'Transfer',
      status: 'Posted',
    })
  })

  it('reverses atomically: a stale-rowVersion Reverse creates no compensating document and leaves the store untouched (D-LIFE-01 §159-161)', async () => {
    const documents = [documentInStatus('Posted')]
    const created: WarehouseDocument[] = []
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
        onCompensatingDocumentCreated: (document) => {
          created.push(document)
        },
      }),
    )
    const before = documents[0]

    const failure = await apiClient
      .post(
        actionUrl('Reverse'),
        { reason: 'خطأ في الترحيل', rowVersion: 2 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)

    expect(failure).toHaveProperty('response.status', 409)
    expect(failure).toHaveProperty('response.data.code', 'document.version_conflict')
    expect(failure).not.toHaveProperty('response.data.relatedDocument')
    expect(failure).not.toHaveProperty('response.data.compensatingDocument')
    expect(created).toHaveLength(0)
    expect(documents[0]).toEqual(before)
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
