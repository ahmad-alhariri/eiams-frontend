import { beforeEach, describe, expect, it } from 'vitest'

import { apiClient } from '@/shared/services/api.client'
import {
  actionRequiresReason,
  createDocumentPolicy,
  createLifecycleEvent,
  createWarehouseDocument,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import {
  applyDocumentAction,
  createWarehouseDocumentActionHandler,
  createWarehouseDocumentDetailHandler,
  createWarehouseDocumentHistoryHandler,
  createWarehouseDocumentListHandler,
  createWarehouseDocumentPolicyHandler,
} from '@/test/msw/warehouse-document-handlers'
import type { DocumentActionType, DocumentStatus } from '@/shared/types/generated/eiams-v1'

const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-00000000ffff'
const SECOND_IDEMPOTENCY_KEY = '00000000-0000-4000-8000-00000000fffd'
const UNKNOWN_ID = '00000000-0000-4000-8000-00000000fffe'

const TRANSITION_CASES: ReadonlyArray<{
  action: DocumentActionType
  from: DocumentStatus
  to: DocumentStatus
  requiresReason: boolean
}> = [
  { action: 'Submit', from: 'Draft', to: 'Submitted', requiresReason: false },
  { action: 'Post', from: 'Submitted', to: 'Posted', requiresReason: false },
  { action: 'Reject', from: 'Submitted', to: 'Rejected', requiresReason: true },
  { action: 'Revise', from: 'Rejected', to: 'Draft', requiresReason: false },
  { action: 'Cancel', from: 'Draft', to: 'Cancelled', requiresReason: true },
  { action: 'Cancel', from: 'Submitted', to: 'Cancelled', requiresReason: true },
  { action: 'Cancel', from: 'Rejected', to: 'Cancelled', requiresReason: true },
  { action: 'Reverse', from: 'Posted', to: 'Reversed', requiresReason: true },
]

function documentInStatus(
  documentStatus: DocumentStatus,
  documentId = fixtureUuid(150),
): ReturnType<typeof createWarehouseDocument> {
  const documentType =
    documentStatus === 'Draft' || documentStatus === 'Cancelled' ? 'Receiving' : 'Issue'
  return createWarehouseDocument({
    documentId,
    documentStatus,
    documentType,
    rowVersion: 1,
    policy: createDocumentPolicy({
      documentId,
      documentStatus,
      rowVersion: 1,
      signedOriginalSatisfied: true,
    }),
    receivingInfo:
      documentType === 'Receiving'
        ? { receivingType: 'Purchase', supplierRef: 'SUP-001', supplierInvoiceRef: null }
        : undefined,
  })
}

describe('document-engine scenario handlers', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it('lists documents with contract meta and filters by status, type, warehouse, and search', async () => {
    const central = { id: fixtureUuid(30), displayName: 'المستودع المركزي' }
    const branch = { id: fixtureUuid(31), displayName: 'مستودع الفرع' }
    const documents = [
      createWarehouseDocument({
        documentId: fixtureUuid(150),
        documentStatus: 'Draft',
        paperDocumentNumber: '2024/101',
        warehouse: central,
      }),
      createWarehouseDocument({
        documentId: fixtureUuid(151),
        documentStatus: 'Submitted',
        documentType: 'Issue',
        paperDocumentNumber: '2024/102',
        warehouse: central,
        receivingInfo: undefined,
      }),
      createWarehouseDocument({
        documentId: fixtureUuid(152),
        documentStatus: 'Posted',
        documentType: 'Transfer',
        paperDocumentNumber: '2024/103',
        warehouse: branch,
        receivingInfo: undefined,
      }),
    ]
    server.use(...createWarehouseDocumentListHandler(documents))

    const { data: all } = await apiClient.get<{
      items: Array<{ documentId: string }>
      meta: { pageIndex: number; pageSize: number; totalItems: number; totalPages: number }
    }>('/warehouse-documents')
    expect(all.items).toHaveLength(3)
    expect(all.meta).toEqual({ pageIndex: 0, pageSize: 20, totalItems: 3, totalPages: 1 })

    const { data: submitted } = await apiClient.get<{ items: Array<{ documentId: string }> }>(
      '/warehouse-documents?documentStatus=Submitted',
    )
    expect(submitted.items.map((item) => item.documentId)).toEqual([fixtureUuid(151)])

    const { data: transfers } = await apiClient.get<{ items: Array<{ documentId: string }> }>(
      '/warehouse-documents?documentType=Transfer',
    )
    expect(transfers.items.map((item) => item.documentId)).toEqual([fixtureUuid(152)])

    const { data: byWarehouse } = await apiClient.get<{ items: Array<{ documentId: string }> }>(
      `/warehouse-documents?warehouseId=${fixtureUuid(31)}`,
    )
    expect(byWarehouse.items.map((item) => item.documentId)).toEqual([fixtureUuid(152)])

    const { data: bySearch } = await apiClient.get<{ items: Array<{ documentId: string }> }>(
      '/warehouse-documents?search=2024/102',
    )
    expect(bySearch.items.map((item) => item.documentId)).toEqual([fixtureUuid(151)])

    const { data: page } = await apiClient.get<{
      items: unknown[]
      meta: { totalItems: number; totalPages: number }
    }>('/warehouse-documents?pageSize=2&pageIndex=1')
    expect(page.items).toHaveLength(1)
    expect(page.meta).toEqual({ pageIndex: 1, pageSize: 2, totalItems: 3, totalPages: 2 })
  })

  it('serves detail, history, and policy; unknown ids return an Arabic 404 problem', async () => {
    const document = documentInStatus('Submitted')
    const events = [
      createLifecycleEvent({
        documentId: document.documentId,
        documentRowVersion: 1,
        eventType: 'Created',
        toStatus: 'Draft',
      }),
      createLifecycleEvent({
        documentId: document.documentId,
        documentRowVersion: 2,
        eventId: fixtureUuid(204),
        eventType: 'Submitted',
        fromStatus: 'Draft',
        toStatus: 'Submitted',
      }),
    ]
    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      ...createWarehouseDocumentHistoryHandler(events),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    const { data: detail } = await apiClient.get<{ documentStatus: DocumentStatus }>(
      `/warehouse-documents/${document.documentId}`,
    )
    expect(detail.documentStatus).toBe('Submitted')

    const { data: history } = await apiClient.get<{
      currentStatus: DocumentStatus
      currentRowVersion: number
      events: Array<{ eventType: string }>
    }>(`/warehouse-documents/${document.documentId}/history`)
    expect(history).toMatchObject({
      currentStatus: 'Submitted',
      currentRowVersion: 2,
    })
    expect(history.events.map((event) => event.eventType)).toEqual(['Created', 'Submitted'])

    const { data: policy } = await apiClient.get<{ documentStatus: DocumentStatus }>(
      `/warehouse-documents/${document.documentId}/policy`,
    )
    expect(policy.documentStatus).toBe('Submitted')

    const missing = await apiClient
      .get(`/warehouse-documents/${UNKNOWN_ID}`)
      .catch((error: unknown) => error)
    expect(missing).toHaveProperty('response.status', 404)
    expect(missing).toHaveProperty('response.data.code', 'record.not_found')

    const missingHistory = await apiClient
      .get(`/warehouse-documents/${UNKNOWN_ID}/history`)
      .catch((error: unknown) => error)
    expect(missingHistory).toHaveProperty('response.status', 404)
  })

  it('applies the full state-transition table with rowVersion bumps and no idempotent replay', () => {
    for (const testCase of TRANSITION_CASES) {
      const document = documentInStatus(testCase.from, fixtureUuid(150))
      const outcome = applyDocumentAction({
        action: testCase.action,
        document,
        rowVersion: document.rowVersion,
        reason: testCase.requiresReason ? 'سبب الإجراء' : null,
        occurredAt: '2026-01-05T00:00:00.000Z',
      })

      if (outcome.kind === 'conflict' || outcome.kind === 'validation') {
        throw new Error(`unexpected failure for ${testCase.action}: ${outcome.problem.code}`)
      }
      expect(outcome.document.documentStatus).toBe(testCase.to)
      expect(outcome.document.rowVersion).toBe(document.rowVersion + 1)
      expect(outcome.document.policy).toMatchObject({
        documentStatus: testCase.to,
        rowVersion: document.rowVersion + 1,
      })
      expect(outcome.result.lifecycleEvent).toMatchObject({
        fromStatus: testCase.from,
        toStatus: testCase.to,
        documentRowVersion: document.rowVersion + 1,
      })

      const replay = applyDocumentAction({
        action: testCase.action,
        document: outcome.document,
        rowVersion: outcome.document.rowVersion,
        reason: testCase.requiresReason ? 'سبب الإجراء' : null,
      })
      expect(replay.kind).toBe('conflict')
      if (replay.kind === 'conflict') {
        expect(replay.problem.currentStatus).toBe(testCase.to)
        expect(replay.problem.currentRowVersion).toBe(document.rowVersion + 1)
      }

      const stale = applyDocumentAction({
        action: testCase.action,
        document,
        rowVersion: document.rowVersion + 1,
        reason: testCase.requiresReason ? 'سبب الإجراء' : null,
      })
      expect(stale.kind).toBe('conflict')
      if (stale.kind === 'conflict') {
        expect(stale.problem.code).toBe('document.version_conflict')
        expect(stale.problem.currentRowVersion).toBe(document.rowVersion)
        expect(stale.problem.policy.documentId).toBe(document.documentId)
      }
    }
  })

  it('validates reason presence for reject/cancel/reverse and rejects unsupported actions', () => {
    const draft = documentInStatus('Draft')
    const cancel = applyDocumentAction({
      action: 'Cancel',
      document: draft,
      rowVersion: draft.rowVersion,
      reason: null,
    })
    expect(cancel.kind).toBe('validation')
    if (cancel.kind === 'validation') {
      expect(cancel.problem.code).toBe('document.reason_required')
      expect(cancel.problem.fieldErrors).toEqual([
        expect.objectContaining({ field: 'reason', code: 'document.reason_required' }),
      ])
    }

    const unsupported = applyDocumentAction({
      action: 'Edit',
      document: draft,
      rowVersion: draft.rowVersion,
    })
    expect(unsupported.kind).toBe('validation')
    if (unsupported.kind === 'validation') {
      expect(unsupported.problem.code).toBe('document.action_unsupported')
    }
    expect(actionRequiresReason('Cancel')).toBe(true)
    expect(actionRequiresReason('Reverse')).toBe(true)
    expect(actionRequiresReason('Submit')).toBe(false)
  })

  it('runs the six POST action routes against a mutable store and persists mutations', async () => {
    const documents = [documentInStatus('Draft')]
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
      }),
    )

    const { data: result } = await apiClient.post<{
      document: { documentStatus: DocumentStatus; rowVersion: number }
      lifecycleEvent: { eventType: string; fromStatus: DocumentStatus }
    }>(
      `/warehouse-documents/${fixtureUuid(150)}/submit`,
      { rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(result.document.documentStatus).toBe('Submitted')
    expect(result.document.rowVersion).toBe(2)
    expect(result.lifecycleEvent.eventType).toBe('Submitted')
    expect(result.lifecycleEvent.fromStatus).toBe('Draft')
    expect(documents[0]).toMatchObject({ documentStatus: 'Submitted', rowVersion: 2 })

    const cancelled = await apiClient.post<{
      document: { documentStatus: DocumentStatus; rowVersion: number }
      lifecycleEvent: { eventType: string; fromStatus: DocumentStatus }
    }>(
      `/warehouse-documents/${fixtureUuid(150)}/cancel`,
      { rowVersion: 2, reason: 'إلغاء' },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(cancelled.data.document.documentStatus).toBe('Cancelled')
    expect(cancelled.data.document.rowVersion).toBe(3)
    expect(cancelled.data.lifecycleEvent.eventType).toBe('Cancelled')
    expect(cancelled.data.lifecycleEvent.fromStatus).toBe('Submitted')
    expect(documents[0]).toMatchObject({ documentStatus: 'Cancelled', rowVersion: 3 })
    expect(documents[0]?.policy.documentStatus).toBe('Cancelled')

    const replayCancel = await apiClient
      .post(
        `/warehouse-documents/${fixtureUuid(150)}/cancel`,
        { rowVersion: 3, reason: 'إلغاء مجدد' },
        { headers: { 'Idempotency-Key': SECOND_IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)
    expect(replayCancel).toHaveProperty('response.status', 409)
    expect(replayCancel).toHaveProperty('response.data.code', 'document.action_not_allowed')
    expect(replayCancel).toHaveProperty('response.data.currentStatus', 'Cancelled')
    expect(replayCancel).toHaveProperty('response.data.policy.documentStatus', 'Cancelled')
    expect(documents[0]).toMatchObject({ documentStatus: 'Cancelled', rowVersion: 3 })
  })

  it('returns the LifecycleConflict body on stale rowVersion and 422 on missing reason routes', async () => {
    const documents = [documentInStatus('Draft')]
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
      }),
    )

    const stale = await apiClient
      .post(
        `/warehouse-documents/${fixtureUuid(150)}/submit`,
        { rowVersion: 2 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)
    expect(stale).toHaveProperty('response.status', 409)
    expect(stale).toHaveProperty('response.data.code', 'document.version_conflict')
    expect(stale).toHaveProperty('response.data.status', 409)
    expect(stale).toHaveProperty('response.data.currentRowVersion', 1)
    expect(stale).toHaveProperty('response.data.currentStatus', 'Draft')
    expect(stale).toHaveProperty('response.data.policy.documentId', fixtureUuid(150))
    expect(documents[0]).toMatchObject({ documentStatus: 'Draft', rowVersion: 1 })

    const submitted = [documentInStatus('Submitted', fixtureUuid(151))]
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: submitted[0]!,
        documentStore: () => submitted,
      }),
    )
    const missingReason = await apiClient
      .post(
        `/warehouse-documents/${fixtureUuid(151)}/reject`,
        { rowVersion: 1 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)
    expect(missingReason).toHaveProperty('response.status', 422)
    expect(missingReason).toHaveProperty('response.data.code', 'document.reason_required')
  })

  it('posts only after submit and records the pair of lifecycle events in order', async () => {
    const documents = [documentInStatus('Draft')]
    server.use(
      ...createWarehouseDocumentActionHandler({
        initialDocument: documents[0]!,
        documentStore: () => documents,
      }),
    )

    const premature = await apiClient
      .post(
        `/warehouse-documents/${fixtureUuid(150)}/post`,
        { rowVersion: 1 },
        { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
      )
      .catch((caught: unknown) => caught)
    expect(premature).toHaveProperty('response.status', 409)
    expect(premature).toHaveProperty('response.data.code', 'document.action_not_allowed')

    await apiClient.post(
      `/warehouse-documents/${fixtureUuid(150)}/submit`,
      { rowVersion: 1 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    const { data: posted } = await apiClient.post<{
      document: { rowVersion: number }
      lifecycleEvent: { eventType: string }
    }>(
      `/warehouse-documents/${fixtureUuid(150)}/post`,
      { rowVersion: 2 },
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY } },
    )
    expect(posted.document.rowVersion).toBe(3)
    expect(posted.lifecycleEvent.eventType).toBe('Posted')
    expect(documents[0]).toMatchObject({ documentStatus: 'Posted', rowVersion: 3 })
    expect(documents[0]?.policy.documentStatus).toBe('Posted')
    expect(documents[0]?.postedAt).toBeDefined()
  })
})
